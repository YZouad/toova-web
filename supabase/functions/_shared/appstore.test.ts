/** @vitest-environment node */
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import * as x509 from '@peculiar/x509';
import { SignJWT } from 'jose';
import {
  allowSkipJwsVerify,
  assertAppAccountTokenMatchesUser,
  isLocalSupabaseUrl,
  parseTransactionInfo,
  verifyAppleX5cChain,
  verifyAppStoreJws,
} from './appstore.ts';
import { APPLE_INTERMEDIATE_OID, APPLE_LEAF_OID } from './appleRootCaG3.ts';
import { HttpError } from './stripeBilling.ts';

beforeAll(() => {
  if (typeof (globalThis as { Deno?: unknown }).Deno === 'undefined') {
    Object.defineProperty(globalThis, 'Deno', {
      value: {
        env: {
          get: (name: string) => process.env[name],
        },
      },
      configurable: true,
    });
  }
});

const cryptoSubtle = globalThis.crypto;

async function generateEcKeyPair() {
  return await cryptoSubtle.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  );
}

async function createCert(opts: {
  subject: string;
  issuer: string;
  keys: CryptoKeyPair;
  issuerKeys: CryptoKeyPair;
  isCa?: boolean;
  oids?: string[];
  serial?: number;
}): Promise<x509.X509Certificate> {
  const extensions: x509.Extension[] = [
    new x509.BasicConstraintsExtension(Boolean(opts.isCa), opts.isCa ? 1 : undefined, true),
    new x509.KeyUsagesExtension(
      opts.isCa
        ? x509.KeyUsageFlags.keyCertSign | x509.KeyUsageFlags.cRLSign
        : x509.KeyUsageFlags.digitalSignature,
      true,
    ),
  ];
  for (const oid of opts.oids ?? []) {
    extensions.push(new x509.Extension(oid, false, new Uint8Array([0x05, 0x00])));
  }
  return await x509.X509CertificateGenerator.create({
    serialNumber: String(opts.serial ?? Math.floor(Math.random() * 1e9)),
    subject: opts.subject,
    issuer: opts.issuer,
    notBefore: new Date(Date.now() - 60_000),
    notAfter: new Date(Date.now() + 86_400_000),
    signingAlgorithm: { name: 'ECDSA', hash: 'SHA-256' },
    publicKey: opts.keys.publicKey,
    signingKey: opts.issuerKeys.privateKey,
    extensions,
  });
}

function certToX5c(cert: x509.X509Certificate): string {
  const raw = new Uint8Array(cert.rawData);
  let bin = '';
  for (const b of raw) bin += String.fromCharCode(b);
  return btoa(bin);
}

async function buildAppleishChain() {
  const rootKeys = await generateEcKeyPair();
  const intermediateKeys = await generateEcKeyPair();
  const leafKeys = await generateEcKeyPair();

  const root = await createCert({
    subject: 'CN=Test Apple Root G3',
    issuer: 'CN=Test Apple Root G3',
    keys: rootKeys,
    issuerKeys: rootKeys,
    isCa: true,
    serial: 1,
  });
  const intermediate = await createCert({
    subject: 'CN=Test Apple WWDR',
    issuer: 'CN=Test Apple Root G3',
    keys: intermediateKeys,
    issuerKeys: rootKeys,
    isCa: true,
    oids: [APPLE_INTERMEDIATE_OID],
    serial: 2,
  });
  const leaf = await createCert({
    subject: 'CN=Test App Store Leaf',
    issuer: 'CN=Test Apple WWDR',
    keys: leafKeys,
    issuerKeys: intermediateKeys,
    oids: [APPLE_LEAF_OID],
    serial: 3,
  });

  return {
    rootPem: root.toString('pem'),
    x5c: [certToX5c(leaf), certToX5c(intermediate)],
    leafKeys,
  };
}

async function signJws(
  leafPrivateKey: CryptoKey,
  x5c: string[],
  payload: Record<string, unknown>,
): Promise<string> {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: 'ES256', x5c })
    .sign(leafPrivateKey);
}

afterEach(() => {
  delete process.env.APPSTORE_SKIP_JWS_VERIFY;
  delete process.env.SUPABASE_URL;
  delete process.env.APPSTORE_BUNDLE_ID;
});

describe('allowSkipJwsVerify', () => {
  it('is false in production even when skip flag is set', () => {
    process.env.APPSTORE_SKIP_JWS_VERIFY = '1';
    process.env.SUPABASE_URL = 'https://xfifgtedssabneqlxbhf.supabase.co';
    expect(allowSkipJwsVerify()).toBe(false);
  });

  it('is true only for local supabase with skip flag', () => {
    process.env.APPSTORE_SKIP_JWS_VERIFY = '1';
    process.env.SUPABASE_URL = 'http://127.0.0.1:54321';
    expect(allowSkipJwsVerify()).toBe(true);
    expect(isLocalSupabaseUrl('http://localhost:54321')).toBe(true);
  });
});

describe('assertAppAccountTokenMatchesUser', () => {
  it('rejects missing token', () => {
    expect(() => assertAppAccountTokenMatchesUser(null, 'user-1')).toThrow(HttpError);
  });

  it('rejects mismatch', () => {
    expect(() => assertAppAccountTokenMatchesUser('other', 'user-1')).toThrow(HttpError);
  });

  it('accepts matching user id', () => {
    expect(() =>
      assertAppAccountTokenMatchesUser(
        'AAAAAAAA-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
      ),
    ).not.toThrow();
  });
});

describe('verifyAppleX5cChain', () => {
  it('rejects incomplete chains', async () => {
    await expect(verifyAppleX5cChain(['only-leaf'])).rejects.toThrow(HttpError);
  });

  it('rejects a forged self-signed leaf against the real Apple root', async () => {
    const keys = await generateEcKeyPair();
    const selfSigned = await createCert({
      subject: 'CN=Forged',
      issuer: 'CN=Forged',
      keys,
      issuerKeys: keys,
      oids: [APPLE_LEAF_OID, APPLE_INTERMEDIATE_OID],
    });
    const der = certToX5c(selfSigned);
    await expect(verifyAppleX5cChain([der, der])).rejects.toThrow(HttpError);
  });

  it('accepts a valid Apple-OID chain under a test root', async () => {
    const chain = await buildAppleishChain();
    const leafPem = await verifyAppleX5cChain(chain.x5c, chain.rootPem);
    expect(leafPem).toContain('BEGIN CERTIFICATE');
  });
});

describe('verifyAppStoreJws / parseTransactionInfo', () => {
  it('accepts a valid JWS with matching bundleId under a test root', async () => {
    const chain = await buildAppleishChain();
    const jws = await signJws(chain.leafKeys.privateKey, chain.x5c, {
      transactionId: 'txn-1',
      productId: 'net.toova.pro.monthly',
      bundleId: 'net.toova.app',
      appAccountToken: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
    });
    const payload = await verifyAppStoreJws(jws, {
      trustedRootPem: chain.rootPem,
      expectedBundleId: 'net.toova.app',
    });
    expect(payload.transactionId).toBe('txn-1');
  });

  it('rejects wrong bundleId', async () => {
    const chain = await buildAppleishChain();
    const jws = await signJws(chain.leafKeys.privateKey, chain.x5c, {
      transactionId: 'txn-1',
      productId: 'net.toova.pro.monthly',
      bundleId: 'com.attacker.app',
    });
    await expect(
      verifyAppStoreJws(jws, {
        trustedRootPem: chain.rootPem,
        expectedBundleId: 'net.toova.app',
      }),
    ).rejects.toThrow(/Unexpected bundleId/);
  });

  it('rejects missing bundleId on transactions', async () => {
    process.env.SUPABASE_URL = 'https://xfifgtedssabneqlxbhf.supabase.co';
    const chain = await buildAppleishChain();
    const jws = await signJws(chain.leafKeys.privateKey, chain.x5c, {
      transactionId: 'txn-1',
      productId: 'net.toova.pro.monthly',
    });
    await expect(
      parseTransactionInfo(jws, {
        trustedRootPem: chain.rootPem,
        expectedBundleId: 'net.toova.app',
      }),
    ).rejects.toThrow(/Missing bundleId/);
  });
});
