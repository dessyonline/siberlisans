import * as React from 'react'

import { Button, Link, Text } from '@react-email/components'

import { EmailLayout, button, fallbackUrl, link, text } from './brand'

interface EmailChangeEmailProps {
  siteName: string
  oldEmail: string
  email: string
  newEmail: string
  confirmationUrl: string
}

export const EmailChangeEmail = ({
  oldEmail,
  newEmail,
  confirmationUrl,
}: EmailChangeEmailProps) => (
  <EmailLayout
    preview="E-posta değişikliğinizi onaylayın"
    heading="E-posta değişikliğini onaylayın"
  >
    <Text style={text}>Merhaba,</Text>
    <Text style={text}>
      SiberLisans hesabınızın e-posta adresini <strong>{oldEmail}</strong>{' '}
      adresinden <strong>{newEmail}</strong> adresine değiştirme talebi aldık.
      Onaylamak için aşağıdaki butona tıklayın.
    </Text>
    <Button style={button} href={confirmationUrl}>
      Değişikliği onayla
    </Button>
    <Text style={fallbackUrl}>
      Buton çalışmazsa bu bağlantıyı tarayıcınıza yapıştırabilirsiniz:
      <br />
      <Link href={confirmationUrl} style={link}>
        {confirmationUrl}
      </Link>
    </Text>
    <Text style={{ ...text, marginTop: '24px' }}>
      Bu talebi siz yapmadıysanız lütfen hesabınızın şifresini hemen
      değiştirin.
    </Text>
  </EmailLayout>
)

export default EmailChangeEmail
