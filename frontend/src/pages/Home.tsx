import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../features/auth/AuthContext'
import { str } from '../i18n'
import { StarDivider, Star8 } from '../components/Star8'
import { ThemeToggle } from '../components/ThemeToggle'
import heroArch from '../assets/hero-arch.svg'

export function HomePage() {
  return (
    <main>
      <section className="zellige zellige-veil pt-28" id="hero" aria-label="البطل">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-12 sm:px-6 md:grid-cols-2 lg:px-8">
          <div>
            <p className="font-classic text-lg" style={{ color: 'var(--gold)' }}>
              <Star8 size={18} className="inline" /> {str.tagline}
            </p>
            <h1 className="font-heading mt-2 text-4xl font-bold sm:text-5xl">
              مجلس — دروس الشيخ منظمة
            </h1>
            <p className="muted-t mt-3">
              حلقة مسجد خاصة: تسجيلات + نصوص + مرفقات + اختبارات + سؤال من الدروس — بالعربية أولًا.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <Link to="/signup" className="btn-primary transition-ui rounded-xl px-6 py-2 font-bold">
                {str.signup}
              </Link>
              <Link
                to="/login"
                className="transition-ui clickable rounded-xl border px-6 py-2"
                style={{ borderColor: 'var(--gold)' }}
              >
                {str.login}
              </Link>
              <ThemeToggle />
            </div>
          </div>
          <div className="arch arch-frame card hidden p-4 md:block">
            <img src={heroArch} alt="زخرفة أندلسية" className="arch-img h-64 w-full object-cover" />
          </div>
        </div>
      </section>
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <StarDivider label="المزايا" />
        <section className="grid gap-4 py-6 sm:grid-cols-3" aria-label="المزايا">
          {[
            { t: 'دروس منظمة', d: 'كل تسجيل مربوط بنصوصه ووصفه ومرفقاته' },
            { t: 'اختبارات عادلة', d: 'تصحيح تلقائي ومقالية بملاحظة الشيخ' },
            { t: 'سؤال من الدروس', d: 'إجابات مستشهدة بالدرس والصفحات فقط' },
          ].map((f) => (
            <div key={f.t} className="card arabesque rounded-2xl p-5">
              <h2 className="font-heading font-bold">{f.t}</h2>
              <p className="muted-t mt-1 text-sm">{f.d}</p>
            </div>
          ))}
        </section>
      </div>
    </main>
  )
}

export function NotFoundPage() {
  const nav = useNavigate()
  const { user } = useAuth()
  return (
    <main className="mx-auto max-w-md px-4 pt-28 text-center">
      <h1 className="font-heading text-3xl font-bold">404</h1>
      <p className="muted-t mt-2">{str.notFound}</p>
      <div className="mt-4 flex justify-center gap-2">
        <button
          type="button"
          onClick={() => nav(-1)}
          className="transition-ui clickable rounded-xl border px-6 py-2"
          style={{ borderColor: 'var(--border)' }}
        >
          رجوع
        </button>
        {user ? (
          <Link to="/dashboard" className="btn-primary transition-ui rounded-xl px-6 py-2">
            لوحتي
          </Link>
        ) : (
          <Link to="/" className="btn-primary transition-ui rounded-xl px-6 py-2">
            الرئيسية
          </Link>
        )}
      </div>
    </main>
  )
}

export function Footer() {
  return (
    <footer className="zellige zellige-veil mt-12" aria-label="التذييل">
      <div className="mx-auto max-w-6xl px-4 py-8 text-center sm:px-6 lg:px-8">
        <StarDivider />
        <p className="font-heading mt-3">مجلس — MAJLIS</p>
        <p className="muted-t text-sm">حلقة خاصة · عربية أولًا</p>
      </div>
    </footer>
  )
}
