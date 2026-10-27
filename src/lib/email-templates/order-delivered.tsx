import * as React from "react";
import { Button, Hr, Text } from "@react-email/components";
import type { TemplateEntry } from "./registry";
import { EmailLayout, button, codeStyle, link, text } from "./brand";

interface Props {
  productName?: string;
  referenceCode?: string;
  deliveryData?: string;
}

const Email = ({ productName = "Dijital ürün", referenceCode = "-", deliveryData = "" }: Props) => (
  <EmailLayout
    preview={`${productName} siparişiniz teslim edildi`}
    heading="Siparişiniz teslim edildi"
  >
    <Text style={text}>Tedarikçi teslimatı tamamladı. Ürün bilgileriniz hesabınıza eklendi.</Text>
    <Text style={text}>
      <strong>Ürün:</strong> {productName}
      <br />
      <strong>Sipariş kodu:</strong> {referenceCode}
    </Text>
    <Text style={codeStyle}>{deliveryData || "Hesabım sayfasından görüntüleyebilirsiniz."}</Text>
    <Button href="https://siberlisans.com/hesabim" style={button}>
      Hesabımda görüntüle
    </Button>
    <Hr />
    <Text style={text}>
      Bilgilerinizi kimseyle paylaşmayın. Destek için{" "}
      <a href="https://siberlisans.com/destek" style={link}>
        Siber Lisans destek
      </a>{" "}
      sayfasını kullanabilirsiniz.
    </Text>
  </EmailLayout>
);

export const template = {
  component: Email,
  subject: (data: Record<string, any>) =>
    `${data.productName || "Dijital ürün"} siparişiniz teslim edildi`,
  displayName: "Sipariş teslim edildi",
  previewData: {
    productName: "Örnek lisans",
    referenceCode: "SBR-EXAMPLE",
    deliveryData: "XXXX-XXXX-XXXX",
  },
} satisfies TemplateEntry;
