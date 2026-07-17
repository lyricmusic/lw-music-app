export const emailFieldValidation = {
  pattern: {
    message: 'Введите корректный email.',
    value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  },
  required: 'Обязательное поле.',
  setValueAs: (value: string) => value.trim(),
}
