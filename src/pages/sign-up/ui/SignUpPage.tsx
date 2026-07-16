import { AuthCard } from '@/widgets/auth-card'

export function SignUpPage() {
  return (
    <main className="flex min-h-screen justify-end bg-[url('@/assets/start-bg.png')] bg-left bg-no-repeat">
      <AuthCard mode="sign-up" />
    </main>
  )
}
