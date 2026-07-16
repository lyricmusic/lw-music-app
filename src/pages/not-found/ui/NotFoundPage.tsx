import { Link } from 'react-router-dom'

import { routes } from '@/shared/config/routes'
import { Button } from '@mui/material'

export function NotFoundPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#ECEDF2] p-6 text-center">
      <h1 className="text-4xl font-ultrabold">Страница не найдена</h1>
      <p className="text-secondary-text">
        Проверьте адрес или вернитесь к списку комнат.
      </p>
      <Button component={Link} to={routes.rooms} variant="contained">
        Перейти к комнатам
      </Button>
    </main>
  )
}
