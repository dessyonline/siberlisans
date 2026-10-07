import * as React from 'react'
import { Body, Container, Head, Heading, Html, Preview, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'

interface Props { code?: string }

const Email = ({ code = '------' }: Props) => (
  <Html lang="tr" dir="ltr">
    <Head />
    <Preview>Siber Lisans doğrulama kodunuz: {code}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>E-posta doğrulama</Heading>
        <Text style={text}>Siber Lisans hesabınızı etkinleştirmek için bu kodu girin:</Text>
        <Text style={codeStyle}>{code}</Text>
        <Text style={small}>Kod 15 dakika geçerlidir. Bu isteği siz yapmadıysanız e-postayı yok sayabilirsiniz.</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: 'Siber Lisans e-posta doğrulama kodunuz',
  displayName: 'Doğrulama kodu',
  previewData: { code: '123456' },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, Helvetica, sans-serif' }
const container = { padding: '24px', maxWidth: '520px' }
const h1 = { fontSize: '20px', color: '#111111', margin: '0 0 16px' }
const text = { fontSize: '14px', lineHeight: '22px', color: '#111111' }
const codeStyle = { fontSize: '30px', fontWeight: 700, letterSpacing: '8px', color: '#111111' }
const small = { fontSize: '12px', lineHeight: '20px', color: '#555555' }
