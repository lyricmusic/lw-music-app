import { Link } from 'react-router'

import logo from '@assets/lw.svg'

import { useSession } from '@/entities/session'
import { routes } from '@/shared/config/routes'
import { trackProductEvent } from '@/shared/lib/telemetry'

import './HomePage.css'

const steps = [
  {
    number: '01',
    title: 'Создайте комнату',
    text: 'Выберите название, настроение и правила доступа — публично или только для своих.',
  },
  {
    number: '02',
    title: 'Отправьте ссылку',
    text: 'Друзья увидят приглашение и смогут присоединиться гостями без пароля и email.',
  },
  {
    number: '03',
    title: 'Запускайте музыку',
    text: 'Смотрите клипы в одном ритме, собирайте очередь, общайтесь и танцуйте персонажами.',
  },
] as const

const features = [
  {
    symbol: '▶',
    title: 'Один плеер для всех',
    text: 'Смена клипа синхронизируется для всей комнаты — участники смотрят и слушают его одновременно.',
  },
  {
    symbol: '↗',
    title: 'Вход по приглашению',
    text: 'Одна ссылка открывает комнату и помогает гостю войти без лишних шагов.',
  },
  {
    symbol: '✦',
    title: 'Персонаж с характером',
    text: 'Настройте внешность персонажа и выберите танец, чтобы выразить настроение в комнате.',
  },
  {
    symbol: '≡',
    title: 'Очередь и общение',
    text: 'Предлагайте следующие клипы, пишите в чат и реагируйте в моменте.',
  },
] as const

type LandingDestination = 'rooms' | 'sign_in' | 'sign_up'
type LandingPlacement = 'final' | 'header' | 'hero'

function trackLandingCta(
  placement: LandingPlacement,
  destination: LandingDestination,
) {
  trackProductEvent({
    name: 'landing_cta_clicked',
    properties: { destination, placement },
  })
}

export function HomePage() {
  const { user } = useSession()
  const primaryRoute = user ? routes.rooms : routes.signUp
  const primaryDestination = user ? 'rooms' : 'sign_up'
  const primaryLabel = user ? 'Открыть комнаты' : 'Создать комнату'

  return (
    <main className="landing-page">
      <header className="landing-header">
        <div className="landing-container landing-header__inner">
          <Link aria-label="Syncly — главная" className="landing-logo" to="/">
            <img alt="Syncly" height="52" src={logo} width="167" />
          </Link>

          <nav aria-label="Разделы лендинга" className="landing-nav">
            <a href="#how-it-works">Как это работает</a>
            <a href="#features">Возможности</a>
          </nav>

          <div className="landing-header__actions">
            {!user && (
              <Link
                className="landing-header__login"
                onClick={() => trackLandingCta('header', 'sign_in')}
                to={routes.signIn}
              >
                Войти
              </Link>
            )}
            <Link
              className="landing-button landing-button--compact"
              onClick={() => trackLandingCta('header', primaryDestination)}
              to={primaryRoute}
            >
              {user ? 'К комнатам' : 'Начать'}
            </Link>
          </div>
        </div>
      </header>

      <section className="landing-hero">
        <div className="landing-container landing-hero__grid">
          <div className="landing-hero__copy">
            <p className="landing-eyebrow">
              <span aria-hidden="true" />
              Музыкальные комнаты для своих
            </p>
            <h1>
              Смотрите клипы вместе. Даже когда вы{' '}
              <em>далеко друг от друга.</em>
            </h1>
            <p className="landing-hero__lead">
              Создайте комнату, пригласите друзей и проживайте музыку в одном
              ритме — с общей очередью, чатом и персонажами.
            </p>

            <div className="landing-hero__actions">
              <Link
                className="landing-button landing-button--primary"
                onClick={() => trackLandingCta('hero', primaryDestination)}
                to={primaryRoute}
              >
                {primaryLabel}
                <span aria-hidden="true">→</span>
              </Link>
              <a
                className="landing-button landing-button--secondary"
                href="#how-it-works"
              >
                Посмотреть, как это работает
              </a>
            </div>

            <ul aria-label="Преимущества входа" className="landing-hero__notes">
              <li>Без установки</li>
              <li>Можно войти гостем</li>
              <li>Удобно с телефона</li>
            </ul>
          </div>

          <div
            aria-label="Пример музыкальной комнаты Syncly"
            className="landing-room-preview"
            role="img"
          >
            <div className="landing-room-preview__glow" />
            <div className="landing-room-preview__window">
              <div className="landing-room-preview__topbar">
                <div>
                  <span className="landing-room-preview__pulse" />
                  <strong>Ночной эфир</strong>
                </div>
                <span>5 в комнате</span>
              </div>

              <div className="landing-room-preview__content">
                <div className="landing-room-preview__player">
                  <div className="landing-room-preview__lights" />
                  <div
                    className="landing-room-preview__play"
                    aria-hidden="true"
                  >
                    ▶
                  </div>
                  <div className="landing-room-preview__track">
                    <span>Сейчас играет</span>
                    <strong>Ночной плейлист</strong>
                  </div>
                  <div className="landing-room-preview__progress">
                    <span />
                  </div>
                </div>

                <div className="landing-room-preview__side">
                  <div className="landing-room-preview__queue">
                    <span>Дальше</span>
                    <strong>Выбираете вместе</strong>
                    <small>3 клипа в очереди</small>
                  </div>
                  <div className="landing-room-preview__message">
                    <img
                      alt=""
                      height="32"
                      src="/avatars/cherry.svg"
                      width="32"
                    />
                    <p>
                      <strong>Вишня</strong>
                      Этот бит — огонь ✦
                    </p>
                  </div>
                </div>
              </div>

              <div className="landing-room-preview__floor">
                <div>
                  <img alt="" height="44" src="/avatars/pulse.svg" width="44" />
                  <img alt="" height="44" src="/avatars/night.svg" width="44" />
                  <img alt="" height="44" src="/avatars/lime.svg" width="44" />
                  <span>+2</span>
                </div>
                <p>
                  <strong>Танцпол активен</strong>
                  Реакции появляются в моменте
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="landing-proof" aria-label="Главные возможности">
        <div className="landing-container landing-proof__grid">
          <p>
            <strong>Одна ссылка</strong>и друзья уже рядом
          </p>
          <p>
            <strong>Один ритм</strong>
            для всей комнаты
          </p>
          <p>
            <strong>Свой образ</strong>
            для каждого участника
          </p>
        </div>
      </section>

      <section className="landing-section" id="how-it-works">
        <div className="landing-container">
          <div className="landing-section__heading">
            <p className="landing-kicker">Три шага до общего эфира</p>
            <h2>Соберите друзей быстрее, чем выбираете первый клип</h2>
          </div>

          <ol className="landing-steps">
            {steps.map(step => (
              <li key={step.number}>
                <span>{step.number}</span>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section
        className="landing-section landing-section--features"
        id="features"
      >
        <div className="landing-container landing-features-layout">
          <div className="landing-features-intro">
            <p className="landing-kicker">Больше, чем совместный плеер</p>
            <h2>Комната, в которой музыка становится событием</h2>
            <p>
              Syncly соединяет просмотр, выбор музыки и живое общение. Каждый
              участник не просто слушает — он влияет на атмосферу комнаты.
            </p>
          </div>

          <div className="landing-features-grid">
            {features.map(feature => (
              <article key={feature.title}>
                <span aria-hidden="true">{feature.symbol}</span>
                <h3>{feature.title}</h3>
                <p>{feature.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="landing-final">
        <div className="landing-container landing-final__card">
          <div>
            <p className="landing-kicker">Ваша следующая встреча уже близко</p>
            <h2>Включайте музыку. Остальные подтянутся по ссылке.</h2>
          </div>
          <Link
            className="landing-button landing-button--primary"
            onClick={() => trackLandingCta('final', primaryDestination)}
            to={primaryRoute}
          >
            {primaryLabel}
            <span aria-hidden="true">→</span>
          </Link>
        </div>
      </section>

      <footer className="landing-footer">
        <div className="landing-container landing-footer__inner">
          <img alt="Syncly" height="52" src={logo} width="167" />
          <p>Вместе музыка звучит ярче.</p>
          {!user && <Link to={routes.signIn}>Войти в аккаунт</Link>}
        </div>
      </footer>
    </main>
  )
}
