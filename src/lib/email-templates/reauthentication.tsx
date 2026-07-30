import * as React from 'react'

import { Text } from '@react-email/components'

import { EmailLayout, codeStyle, text } from './brand'

interface ReauthenticationEmailProps {
  token: string
}

export const ReauthenticationEmail = ({
  token,
}: ReauthenticationEmailProps) => (
  <EmailLayout
    preview="Doğrulama kodunuz"
    heading="Kimliğinizi doğrulayın"
  >
    <Text style={text}>
      İşleminizi tamamlamak için aşağıdaki doğrulama kodunu kullanın:
    </Text>
    <Text style={codeStyle}>{token}</Text>
    <Text style={text}>
      Kod kısa süre içinde geçerliliğini yitirir. Bu isteği siz yapmadıysanız
      bu e-postayı yok sayabilirsiniz.
    </Text>
  </EmailLayout>
)

export default ReauthenticationEmail
