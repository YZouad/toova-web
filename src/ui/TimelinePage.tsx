import { useEffect, useRef, useState, type ReactNode } from 'react';
import { fetchPlatformStats, type PlatformStats } from '../lib/platformStats';
import { DemoShowcase } from './DemoShowcase';
import {
  Button,
  DisplayHeading,
  Eyebrow,
  MarketingNav,
  MonoMeta,
  RuledList,
  SiteFooter,
} from './kit';

const DEVPOST_URL = 'https://devpost.com/software/toova';
const UNCOMMON_HACKS_YOUTUBE_EMBED = 'https://www.youtube.com/embed/iaohbWm4lxI';
const CERTIFICATE_IMAGE_URL = `${import.meta.env.BASE_URL}pitch-madness-certificate.png`;

interface TimelinePageProps {
  onGetStarted: () => void;
  onLogin: () => void;
  onContact?: () => void;
  onPitchMadness?: () => void;
  onAdmin?: () => void;
  loggedIn?: boolean;
  onGoDashboard?: () => void;
  scrollToDemosOnMount?: boolean;
  onDemosScrolled?: () => void;
}

function formatCount(value: number | null | undefined): string {
  if (value == null) return '—';
  return value.toLocaleString();
}

function TimelineStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="timeline-stat-plate">
      <MonoMeta size="sm" upper tone="dense" className="timeline-stat-label">
        {label}
      </MonoMeta>
      <DisplayHeading level={4} as="div" className="timeline-stat-value">
        {value}
      </DisplayHeading>
    </div>
  );
}

function TimelineMilestone({
  date,
  isLast,
  children,
}: {
  date: string;
  isLast?: boolean;
  children: ReactNode;
}) {
  return (
    <li className={`timeline-milestone${isLast ? ' timeline-milestone--last' : ''}`}>
      <div className="timeline-milestone__header">
        <div className="timeline-marker">
          <MonoMeta size="sm" upper tone="dense">
            {date}
          </MonoMeta>
        </div>
        <div className="timeline-rail-cell" aria-hidden />
      </div>
      <div className="timeline-content">{children}</div>
    </li>
  );
}

export function TimelinePage({
  onGetStarted,
  onLogin,
  onContact,
  onPitchMadness,
  onAdmin,
  loggedIn,
  onGoDashboard,
  scrollToDemosOnMount,
  onDemosScrolled,
}: TimelinePageProps) {
  const demosRef = useRef<HTMLElement>(null);
  const [stats, setStats] = useState<PlatformStats | null>(null);

  const scrollToDemos = () => {
    demosRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  useEffect(() => {
    if (!scrollToDemosOnMount) return;
    const timer = window.setTimeout(() => {
      scrollToDemos();
      onDemosScrolled?.();
    }, 150);
    return () => window.clearTimeout(timer);
  }, [scrollToDemosOnMount, onDemosScrolled]);

  useEffect(() => {
    let cancelled = false;
    void fetchPlatformStats().then((result) => {
      if (!cancelled) setStats(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const primaryAction = loggedIn && onGoDashboard ? onGoDashboard : onGetStarted;
  const secondaryAction = loggedIn && onGoDashboard ? onGoDashboard : onLogin;

  return (
    <div className="toova-page">
      <div className="toova-paper" aria-hidden />

      <MarketingNav
        cta={
          <>
            {!loggedIn ? (
              <Button size="sm" variant="mono" onClick={secondaryAction}>
                Log in
              </Button>
            ) : null}
            <Button size="sm" onClick={primaryAction}>
              {loggedIn ? 'Go to dashboard' : 'Start designing, free'}
            </Button>
          </>
        }
      />

      <div className="toova-frame timeline-hero" style={{ paddingTop: 104 }}>
        <Eyebrow level="page" style={{ marginBottom: 40 }}>
          Our journey
        </Eyebrow>
        <DisplayHeading level={3}>Timeline</DisplayHeading>
        <div className="timeline-hero-actions">
          <p className="timeline-hero-lead">
            From hackathon prototype to a growing platform — key milestones in building Toova.
          </p>
          <Button size="md" onClick={scrollToDemos}>
            Look at demo
          </Button>
        </div>
      </div>

      <div className="toova-frame timeline-body">
        <ol className="timeline-rail">
          <TimelineMilestone date="Now">
            <DisplayHeading level={5} style={{ marginBottom: 16 }}>
              Growing user base
            </DisplayHeading>
            <p className="timeline-copy">
              Toova is live with real users designing rooms, sharing in the community gallery, and
              visualizing purchases before they buy.
            </p>
            <div className="timeline-stats">
              <TimelineStat
                label="Registered profiles"
                value={formatCount(stats?.profileCount)}
              />
              <TimelineStat
                label="Community rooms posted"
                value={formatCount(stats?.communityRoomCount)}
              />
            </div>
          </TimelineMilestone>

          <TimelineMilestone date="Jul 2026">
            <DisplayHeading level={5} style={{ marginBottom: 16 }}>
              Pitch Madness
            </DisplayHeading>
            <p className="timeline-copy">
              Placed 6th at the 9th Annual University Pitch Madness competition, earning $1,000 in seed
              funding from the Coleman Entrepreneurship Center.
            </p>
            <RuledList
              columns={1}
              items={[{ index: '01', label: '$1,000 in seed funding' }]}
            />
            <div className="timeline-subsection">
              <MonoMeta size="sm" upper tone="dense" style={{ display: 'block', marginBottom: 16 }}>
                Certificate of recognition
              </MonoMeta>
              <div className="timeline-certificate-embed">
                <img
                  src={CERTIFICATE_IMAGE_URL}
                  alt="Pitch Madness certificate of recognition — 6th place, Toova"
                  loading="lazy"
                />
              </div>
            </div>
            <div className="timeline-subsection timeline-demos-wrap">
              <DemoShowcase
                id="timeline-demos"
                sectionRef={demosRef}
                title="Application demos."
                note="Current product status"
                intro="See where Toova is today — 2D to 3D conversion, web room design, and mobile AR."
                headingLevel={6}
                variant="embedded"
                className="timeline-demos"
              />
            </div>
          </TimelineMilestone>

          <TimelineMilestone date="Uncommon Hacks" isLast>
            <DisplayHeading level={5} style={{ marginBottom: 16 }}>
              First working version
            </DisplayHeading>
            <p className="timeline-copy">
              Created the first version of Toova with a working AR app at Uncommon Hacks.
            </p>
            <RuledList
              columns={1}
              items={[
                {
                  index: '01',
                  label: (
                    <a href={DEVPOST_URL} target="_blank" rel="noopener noreferrer">
                      View on Devpost
                    </a>
                  ),
                },
              ]}
            />
            <div className="timeline-subsection">
              <div className="landing-video-embed timeline-youtube">
                <iframe
                  src={UNCOMMON_HACKS_YOUTUBE_EMBED}
                  title="Toova at Uncommon Hacks"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                />
              </div>
            </div>
          </TimelineMilestone>
        </ol>
      </div>

      <SiteFooter
        onContact={onContact}
        onPitchMadness={onPitchMadness}
        onAdmin={onAdmin}
      />
    </div>
  );
}
