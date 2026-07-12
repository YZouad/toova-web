interface WelcomePageProps {
  onGetStarted: () => void;
}

export function WelcomePage({ onGetStarted }: WelcomePageProps) {
  return (
    <div className="onboarding-page welcome-page-root">
      <header className="onboarding-header">
        <img src={`${import.meta.env.BASE_URL}toova-logo-cropped.png`} alt="Toova" className="onboarding-logo-img" />
      </header>
      <main className="onboarding-main onboarding-main--narrow welcome-page-main">
        <div className="welcome-hero-stage">
          <div className="onboarding-hero">
            <img src={`${import.meta.env.BASE_URL}toova-logo-cropped.png`} alt="Toova" className="onboarding-hero-logo" />
            <h1 className="onboarding-title">Welcome to Toova!</h1>
            <p className="onboarding-use-case onboarding-welcome-copy">
              Browse and place 3D objects into a virtual room.
              <br />
              or
              <br />
              Snap a photo and Toova converts it into a 3D model you can see in real life.
            </p>
            <button
              type="button"
              className="onboarding-btn onboarding-btn-primary onboarding-hero-cta"
              onClick={onGetStarted}
            >
              Get Started
            </button>
          </div>

          {/* Decorative example reactions — not real customer testimonials */}
          <div className="welcome-review-cloud" aria-hidden="true">
            <div className="welcome-review-card welcome-review-card-1">
              <div className="welcome-review-stars">★★★★★</div>
              <p className="welcome-review-text">
                I could finally see if my desk would fit before moving it.
              </p>
            </div>
            <div className="welcome-review-card welcome-review-card-2">
              <div className="welcome-review-stars">★★★★★</div>
              <p className="welcome-review-text">
                The 3D room view made planning my dorm way easier.
              </p>
            </div>
            <div className="welcome-review-card welcome-review-card-4">
              <div className="welcome-review-stars">★★★★★</div>
              <p className="welcome-review-text">
                I tested three layouts in minutes instead of dragging furniture around.
              </p>
            </div>
            <div className="welcome-review-card welcome-review-card-5">
              <div className="welcome-review-stars">★★★★★</div>
              <p className="welcome-review-text">
                The room preview made everything feel less like guesswork.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
