import { Link } from 'react-router'

import { routes } from '@/shared/config/routes'
import { Button } from '@mui/material'

export function NotFoundPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-[#160B2D] p-6 text-center text-[#F8F3FF]">
      <h1 className="text-4xl">Страница не найдена</h1>
      <p className="text-secondary-text">
        Проверьте адрес или вернитесь к списку комнат.
      </p>
      <Button component={Link} to={routes.rooms} variant="contained">
        Перейти к комнатам
      </Button>
    </main>
  )
}
