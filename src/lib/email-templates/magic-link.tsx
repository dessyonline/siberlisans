import * as React from 'react'

import { Button, Link, Text } from '@react-email/components'

import { EmailLayout, button, fallbackUrl, link, text } from './brand'

interface MagicLinkEmailProps {
  siteName: string
  confirmationUrl: string
}

export const MagicLinkEmail = ({ confirmationUrl }: MagicLinkEmailProps) => (
  <EmailLayout
    preview="Tek kullanımlık giriş bağlantınız"
    heading="Giriş bağlantınız hazır"
  >
    <Text style={text}>Merhaba,</Text>
    <Text style={text}>
      SiberLisans hesabınıza giriş yapmak için aşağıdaki butonu kullanın. Bu
      bağlantı kısa süre içinde geçerliliğini yitirir.
    </Text>
    <Button style={button} href={confirmationUrl}>
      Giriş yap
    </Button>
    <Text style={fallbackUrl}>
      Buton çalışmazsa bu bağlantıyı tarayıcınıza yapıştırabilirsiniz:
      <br />
      <Link href={confirmationUrl} style={link}>
        {confirmationUrl}
      </Link>
    </Text>
    <Text style={{ ...text, marginTop: '24px' }}>
      Bu isteği siz yapmadıysanız bu e-postayı yok sayabilirsiniz.
    </Text>
  </EmailLayout>
)

export default MagicLinkEmail
