import { Link } from "react-router-dom";
import { ArrowRight, Brain, MessageSquareQuote, Scale, Zap } from "lucide-react";
import MicButton from "@/components/MicButton";
import SoundWave from "@/components/SoundWave";

const features = [
  { icon: Brain, title: "Thinks, doesn't agree", body: "The AI actively pushes back, exposes contradictions, and detects logical fallacies. No sycophancy." },
  { icon: MessageSquareQuote, title: "Voice-first", body: "Press one button and speak. Live transcription, interruption, realistic voice replies. All browser-native." },
  { icon: Scale, title: "Grounded in evidence", body: "For time-sensitive claims the AI performs live web search. It never fabricates citations." },
  { icon: Zap, title: "Improve every debate", body: "After each session get a full report: fallacies, biggest assumption, strongest & weakest argument, action items." },
];

const modes = [
  { name: "Devil's Advocate", tag: "Adversarial" },
  { name: "Socratic Questioning", tag: "Inquiry" },
  { name: "Oxford Debate", tag: "Formal" },
  { name: "Cross Examination", tag: "Trial" },
  { name: "Rapid Fire", tag: "Fast" },
  { name: "Philosophy", tag: "Analytic" },
  { name: "Business Strategy", tag: "Investor" },
  { name: "Friendly Discussion", tag: "Steelman" },
];

const topics = [
  "Should AI replace teachers?",
  "Is college still worth it?",
  "Is capitalism ethical?",
  "Should governments regulate AI?",
  "Is social media net positive?",
  "Can art be replaced by AI?",
];

export default function Landing() {
  return (
    <div data-testid="landing-page">
      {/* HERO */}
      <section className="relative overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.08] mix-blend-screen"
          style={{
            backgroundImage:
              "url('https://images.unsplash.com/photo-1608501821300-4f99e58bba77?crop=entropy&cs=srgb&fm=jpg&q=85&w=1920')",
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
          aria-hidden="true"
        />
        <div className="relative mx-auto max-w-7xl px-6 md:px-10 pt-24 md:pt-36 pb-20 md:pb-32">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-16 items-center">
            <div className="lg:col-span-7">
              <p data-testid="hero-eyebrow" className="font-mono text-xs uppercase tracking-[0.32em] text-signal mb-6">
                — Not a chatbot. A sparring partner.
              </p>
              <h1 className="font-serif text-5xl md:text-7xl lg:text-[5.5rem] leading-[0.95] tracking-tighter text-balance">
                Argue with an AI that <em className="text-signal not-italic">actually</em> pushes back.
              </h1>{/* copy below uses HTML entities to satisfy react/no-unescaped-entities */}
              <p className="mt-8 max-w-xl text-lg text-muted_ink leading-relaxed">
                DebateX is a voice-first debate platform where an AI trained to think critically challenges your assumptions,
                catches your fallacies, and helps you reason better &mdash; one conversation at a time.
              </p>
              <div className="mt-10 flex flex-col sm:flex-row items-start sm:items-center gap-4">
                <Link
                  to="/signup"
                  data-testid="hero-cta-signup"
                  className="group inline-flex items-center gap-3 rounded-sm bg-parchment text-ink hover:bg-white transition-colors px-8 py-4 text-sm font-medium"
                >
                  Start debating free
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" strokeWidth={2} />
                </Link>
                <Link
                  to="/login"
                  data-testid="hero-cta-login"
                  className="inline-flex items-center gap-2 rounded-sm border border-rule text-parchment hover:bg-elevated transition-colors px-8 py-4 text-sm font-mono uppercase tracking-[0.18em]"
                >
                  I have an account
                </Link>
              </div>
              <p className="mt-6 font-mono text-xs uppercase tracking-[0.2em] text-muted_ink">
                No credit card &middot; Voice + text supported &middot; ~30 seconds to first debate
              </p>
            </div>

            <div className="lg:col-span-5 flex flex-col items-center gap-8">
              <div className="relative">
                <MicButton active={true} onClick={() => {}} size="xl" testId="hero-mic-demo" disabled />
              </div>
              <SoundWave active={true} bars={32} tone="signal" />
              <div className="glass rounded-xl p-6 max-w-md">
                <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-muted_ink mb-3">Live example</p>
                <p className="font-serif text-xl leading-snug text-parchment">
                  &ldquo;You keep asserting AI will replace teachers, but you haven&rsquo;t defined &lsquo;teaching&rsquo;.
                  Is transferring information the same as forming judgment?&rdquo;
                </p>
                <p className="mt-4 font-mono text-xs text-muted_ink">— DebateX, Socratic mode</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section className="mx-auto max-w-7xl px-6 md:px-10 py-24" data-testid="features-section">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-12 items-end mb-16">
          <div className="md:col-span-5">
            <p className="font-mono text-xs uppercase tracking-[0.28em] text-signal mb-3">01 — Capabilities</p>
            <h2 className="font-serif text-4xl md:text-5xl tracking-tight leading-tight">Built to make you sharper, not agreeable.</h2>{/* apostrophe-safe */}
          </div>
          <p className="md:col-span-6 md:col-start-7 text-muted_ink text-lg leading-relaxed">
            Every conversation is designed around one metric: how well can you reason afterwards?
            The AI plays devil's advocate, catches fallacies, and admits uncertainty instead of inventing sources.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {features.map((f, i) => (
            <article
              key={f.title}
              data-testid={`feature-card-${i}`}
              className="bg-surface border border-rule p-8 rounded-lg hover:border-parchment/40 transition-all duration-500 hover:-translate-y-1"
            >
              <f.icon className="w-6 h-6 text-signal mb-8" strokeWidth={1.5} />
              <h3 className="font-serif text-2xl leading-tight mb-3">{f.title}</h3>
              <p className="text-sm text-muted_ink leading-relaxed">{f.body}</p>
            </article>
          ))}
        </div>
      </section>

      {/* MODES */}
      <section className="border-t border-rule bg-surface/40" data-testid="modes-section">
        <div className="mx-auto max-w-7xl px-6 md:px-10 py-24">
          <div className="mb-14">
            <p className="font-mono text-xs uppercase tracking-[0.28em] text-signal mb-3">02 — Modes</p>
            <h2 className="font-serif text-4xl md:text-5xl tracking-tight max-w-3xl">Eight distinct opponents. One click to switch.</h2>
          </div>
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-px bg-rule">
            {modes.map((m) => (
              <li
                key={m.name}
                data-testid={`mode-preview-${m.name}`}
                className="bg-ink hover:bg-elevated transition-colors p-8 group cursor-default"
              >
                <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-signal mb-4">{m.tag}</p>
                <p className="font-serif text-2xl leading-tight group-hover:text-signal_hover transition-colors">{m.name}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* TOPICS */}
      <section className="mx-auto max-w-7xl px-6 md:px-10 py-24" data-testid="topics-section">
        <p className="font-mono text-xs uppercase tracking-[0.28em] text-signal mb-3">03 — What to debate</p>
        <h2 className="font-serif text-4xl md:text-5xl tracking-tight max-w-3xl mb-12">Bring any topic. Or start with one of these.</h2>
        <div className="flex flex-wrap gap-3">
          {topics.map((t) => (
            <span
              key={t}
              data-testid={`topic-chip-${t}`}
              className="font-mono text-sm text-parchment border border-rule rounded-sm px-5 py-3 hover:border-signal hover:text-signal transition-colors"
            >
              {t}
            </span>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-rule">
        <div className="mx-auto max-w-4xl px-6 md:px-10 py-24 text-center">
          <h2 className="font-serif text-5xl md:text-6xl tracking-tighter leading-none">
            Ready to be <em className="text-signal not-italic">challenged</em>?
          </h2>
          <p className="mt-6 text-muted_ink text-lg">
            Create your account, pick a topic, and press the mic. That&rsquo;s it.
          </p>
          <Link
            to="/signup"
            data-testid="cta-signup-bottom"
            className="mt-10 inline-flex items-center gap-3 rounded-sm bg-signal text-parchment hover:bg-signal_hover transition-colors px-10 py-4 text-sm font-medium"
          >
            Get started
            <ArrowRight className="w-4 h-4" strokeWidth={2} />
          </Link>
        </div>
      </section>
    </div>
  );
}
