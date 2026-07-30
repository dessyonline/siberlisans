import * as React from 'react'

import { Button, Link, Text } from '@react-email/components'

import { EmailLayout, button, fallbackUrl, link, text } from './brand'

interface SignupEmailProps {
  siteName: string
  siteUrl: string
  recipient: string
  confirmationUrl: string
}

export const SignupEmail = ({
  siteUrl,
  recipient,
  confirmationUrl,
}: SignupEmailProps) => (
  <EmailLayout
    preview="Hesabınızı doğrulamak için son bir adım"
    heading="E-posta adresinizi doğrulayın"
  >
    <Text style={text}>Merhaba,</Text>
    <Text style={text}>
      SiberLisans hesabınızı oluşturduğunuz için teşekkürler. {recipient}{' '}
      adresinin size ait olduğunu doğrulamak için aşağıdaki butona tıklayın.
    </Text>
    <Button style={button} href={confirmationUrl}>
      Hesabımı doğrula
    </Button>
    <Text style={fallbackUrl}>
      Buton çalışmazsa bu bağlantıyı tarayıcınıza yapıştırabilirsiniz:
      <br />
      <Link href={confirmationUrl} style={link}>
        {confirmationUrl}
      </Link>
    </Text>
    <Text style={{ ...text, marginTop: '24px' }}>
      Bu kaydı siz yapmadıysanız bu e-postayı yok sayabilirsiniz. Sitemize{' '}
      <Link href={siteUrl} style={link}>
        siberlisans.com
      </Link>{' '}
      adresinden ulaşabilirsiniz.
    </Text>
  </EmailLayout>
)

export default SignupEmail
