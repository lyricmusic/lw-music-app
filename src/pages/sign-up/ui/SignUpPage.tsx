import { AuthCard } from '@/widgets/auth-card'
import background from '@assets/background.svg'

export function SignUpPage() {
  return (
    <main
      className="flex min-h-dvh items-stretch justify-center bg-[#12071F] bg-cover bg-center bg-no-repeat sm:justify-end lg:bg-left"
      style={{ backgroundImage: `url(${background})` }}
    >
      <AuthCard mode="sign-up" />
    </main>
  )
}
