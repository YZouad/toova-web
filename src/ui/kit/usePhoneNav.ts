import { useEffect, useState } from 'react';

export const PHONE_NAV_MQ = '(max-width: 960px)';
export const PHONE_LAYOUT_MQ = '(max-width: 768px)';

export function usePhoneNav(): boolean {
  const [phone, setPhone] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(PHONE_NAV_MQ).matches,
  );

  useEffect(() => {
    const mq = window.matchMedia(PHONE_NAV_MQ);
    const sync = () => setPhone(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  return phone;
}

export function usePhoneLayout(): boolean {
  const [phone, setPhone] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(PHONE_LAYOUT_MQ).matches,
  );

  useEffect(() => {
    const mq = window.matchMedia(PHONE_LAYOUT_MQ);
    const sync = () => setPhone(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  return phone;
}
