import { AuthCard } from '@/widgets/auth-card'
import background from '@assets/background.svg'

export function SignInPage() {
  return (
    <main
      className="flex min-h-screen min-h-dvh justify-end bg-cover bg-center bg-no-repeat lg:bg-left"
      style={{ backgroundImage: `url(${background})` }}
    >
      <AuthCard mode="sign-in" />
    </main>
  )
}
