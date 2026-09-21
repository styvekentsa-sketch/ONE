const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MIN_PASSWORD_LENGTH = 6

export function isValidEmail(email) {
  return EMAIL_REGEX.test(email.trim())
}

export function isValidPassword(password) {
  return password.length >= MIN_PASSWORD_LENGTH
}

export { MIN_PASSWORD_LENGTH }
