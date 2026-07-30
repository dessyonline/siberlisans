import * as React from 'react'

import { Button, Link, Text } from '@react-email/components'

import { EmailLayout, button, fallbackUrl, link, text } from './brand'

interface RecoveryEmailProps {
  siteName: string
  confirmationUrl: string
}

export const RecoveryEmail = ({ confirmationUrl }: RecoveryEmailProps) => (
  <EmailLayout
    preview="Şifrenizi sıfırlamak için bağlantı"
    heading="Şifrenizi sıfırlayın"
  >
    <Text style={text}>Merhaba,</Text>
    <Text style={text}>
      SiberLisans hesabınız için şifre sıfırlama talebi aldık. Yeni bir şifre
      belirlemek için aşağıdaki butona tıklayın.
    </Text>
    <Button style={button} href={confirmationUrl}>
      Yeni şifre belirle
    </Button>
    <Text style={fallbackUrl}>
      Buton çalışmazsa bu bağlantıyı tarayıcınıza yapıştırabilirsiniz:
      <br />
      <Link href={confirmationUrl} style={link}>
        {confirmationUrl}
      </Link>
    </Text>
    <Text style={{ ...text, marginTop: '24px' }}>
      Bu talebi siz yapmadıysanız hiçbir şey yapmanıza gerek yok, şifreniz
      değişmeyecek.
    </Text>
  </EmailLayout>
)

export default RecoveryEmail
