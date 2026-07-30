import * as React from 'react'

import { Button, Link, Text } from '@react-email/components'

import { EmailLayout, button, fallbackUrl, link, text } from './brand'

interface InviteEmailProps {
  siteName: string
  siteUrl: string
  confirmationUrl: string
}

export const InviteEmail = ({ siteUrl, confirmationUrl }: InviteEmailProps) => (
  <EmailLayout
    preview="SiberLisans hesabınıza davet edildiniz"
    heading="Davetiniz hazır"
  >
    <Text style={text}>Merhaba,</Text>
    <Text style={text}>
      SiberLisans platformuna davet edildiniz. Daveti kabul edip hesabınızı
      oluşturmak için aşağıdaki butona tıklayın.
    </Text>
    <Button style={button} href={confirmationUrl}>
      Daveti kabul et
    </Button>
    <Text style={fallbackUrl}>
      Buton çalışmazsa bu bağlantıyı tarayıcınıza yapıştırabilirsiniz:
      <br />
      <Link href={confirmationUrl} style={link}>
        {confirmationUrl}
      </Link>
    </Text>
    <Text style={{ ...text, marginTop: '24px' }}>
      Böyle bir davet beklemiyorsanız bu e-postayı yok sayabilirsiniz.{' '}
      <Link href={siteUrl} style={link}>
        siberlisans.com
      </Link>
    </Text>
  </EmailLayout>
)

export default InviteEmail
