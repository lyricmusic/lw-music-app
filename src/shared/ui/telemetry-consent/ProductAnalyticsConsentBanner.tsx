import { useEffect, useState } from 'react'

import {
  getProductAnalyticsConsent,
  initializeProductAnalyticsFromConsent,
  isProductAnalyticsAvailable,
  setProductAnalyticsConsent,
  type ProductAnalyticsConsent,
} from '@/shared/lib/telemetry'
import { Button } from '@mui/material'

export function ProductAnalyticsConsentBanner() {
  const [consent, setConsent] = useState<ProductAnalyticsConsent>(() =>
    getProductAnalyticsConsent(),
  )

  useEffect(() => {
    void initializeProductAnalyticsFromConsent()
  }, [])

  if (!isProductAnalyticsAvailable() || consent !== 'unknown') return null

  const choose = (choice: 'denied' | 'granted') => {
    setConsent(choice)
    void setProductAnalyticsConsent(choice)
  }

  return (
    <aside
      aria-labelledby="analytics-consent-title"
      className="fixed inset-x-2 bottom-2 z-[1400] mx-auto max-w-3xl rounded-2xl border border-[#6D4A8F] bg-[#24143D] p-4 text-[#F8F3FF] shadow-2xl sm:inset-x-4 sm:bottom-4 sm:flex sm:items-center sm:gap-5 sm:p-5"
    >
      <div className="min-w-0 flex-1">
        <h2 className="text-base font-bold" id="analytics-consent-title">
          Помочь улучшать Syncly?
        </h2>
        <p className="mt-1 text-sm leading-5 text-[#CDBCE2]">
          Разрешите анонимно считать только ключевые действия: вход, создание,
          открытие и выход из комнаты. Имена, сообщения, email, ссылки и коды
          приглашений не отправляются.
        </p>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:mt-0 sm:flex sm:shrink-0">
        <Button
          onClick={() => choose('denied')}
          size="small"
          variant="outlined"
        >
          Не сейчас
        </Button>
        <Button
          onClick={() => choose('granted')}
          size="small"
          variant="contained"
        >
          Разрешить
        </Button>
      </div>
    </aside>
  )
}
