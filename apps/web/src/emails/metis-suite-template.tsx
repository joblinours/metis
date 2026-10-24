import {
  Body,
  Button,
  Column,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Row,
  Section,
  Text,
} from "@react-email/components";

export interface MetisSuiteDetail {
  label: string;
  value: string;
}

export interface MetisSuiteTemplateProps {
  preview: string;
  heading: string;
  intro?: string;
  children?: React.ReactNode;
  details?: MetisSuiteDetail[];
  buttonLabel: string;
  url: string;
  expiry?: string;
  footer?: string;
}

const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";
const SERIF = "Georgia, 'Times New Roman', serif";

const darkModeCss = `
  :root { color-scheme: light dark; supported-color-schemes: light dark; }
  @media (prefers-color-scheme: dark) {
    .m-body,
    .m-body > table > tbody > tr > td { background-color: #111110 !important; }
    .m-card { background-color: #1b1a17 !important; border-color: #35322b !important; }
    .m-heading { color: #f6f3ec !important; }
    .m-text { color: #cdc8bb !important; }
    .m-muted { color: #9c968a !important; }
    .m-url { color: #cdc8bb !important; }
    .m-divider { border-color: #35322b !important; }
    .m-mark { background-color: #f6f3ec !important; color: #111110 !important; }
    .m-wordmark { color: #f6f3ec !important; }
  }
  [data-ogsc] .m-body,
  [data-ogsc] .m-body > table > tbody > tr > td { background-color: #111110 !important; }
  [data-ogsc] .m-card { background-color: #1b1a17 !important; border-color: #35322b !important; }
  [data-ogsc] .m-heading { color: #f6f3ec !important; }
  [data-ogsc] .m-text { color: #cdc8bb !important; }
  [data-ogsc] .m-muted { color: #9c968a !important; }
  [data-ogsc] .m-url { color: #cdc8bb !important; }
  [data-ogsc] .m-divider { border-color: #35322b !important; }
  [data-ogsc] .m-mark { background-color: #f6f3ec !important; color: #111110 !important; }
  [data-ogsc] .m-wordmark { color: #f6f3ec !important; }
`;

const bodyStyle: React.CSSProperties = {
  fontFamily: SANS,
  backgroundColor: "#faf8f4",
  padding: "32px 16px",
  color: "#111110",
  margin: 0,
};

const containerStyle: React.CSSProperties = {
  maxWidth: "480px",
  margin: "0 auto",
  backgroundColor: "#ffffff",
  borderRadius: "12px",
  padding: "32px",
  border: "1px solid #e9e3d6",
};

const brandRowStyle: React.CSSProperties = {
  margin: "0 0 24px",
};

const markCellStyle: React.CSSProperties = {
  width: "28px",
  height: "28px",
  backgroundColor: "#111110",
  color: "#ffffff",
  fontFamily: SERIF,
  fontSize: "16px",
  fontWeight: 700,
  lineHeight: "28px",
  textAlign: "center",
  borderRadius: "6px",
};

const wordmarkCellStyle: React.CSSProperties = {
  fontFamily: SERIF,
  fontSize: "16px",
  fontWeight: 600,
  color: "#111110",
  letterSpacing: "0.2px",
  paddingLeft: "10px",
};

const headingStyle: React.CSSProperties = {
  fontFamily: SERIF,
  fontSize: "24px",
  fontWeight: 600,
  color: "#111110",
  margin: "0 0 8px",
};

const introStyle: React.CSSProperties = {
  fontSize: "14px",
  lineHeight: "1.6",
  color: "#46443d",
  margin: "0 0 24px",
};

const detailsStyle: React.CSSProperties = {
  margin: "0 0 24px",
};

const detailLineStyle: React.CSSProperties = {
  fontSize: "13px",
  lineHeight: "1.6",
  color: "#46443d",
  margin: "0 0 4px",
};

const detailLabelStyle: React.CSSProperties = {
  color: "#6f6a5f",
};

const buttonStyle: React.CSSProperties = {
  display: "inline-block",
  backgroundColor: "#c8922a",
  color: "#111110",
  fontWeight: 600,
  textDecoration: "none",
  padding: "12px 24px",
  borderRadius: "8px",
  fontSize: "14px",
  boxSizing: "border-box",
};

const expiryStyle: React.CSSProperties = {
  fontSize: "12px",
  lineHeight: "1.6",
  color: "#6f6a5f",
  margin: "12px 0 0",
};

const fallbackStyle: React.CSSProperties = {
  fontSize: "12px",
  lineHeight: "1.6",
  color: "#6f6a5f",
  margin: "24px 0 0",
};

const urlStyle: React.CSSProperties = {
  wordBreak: "break-all",
  color: "#46443d",
};

const dividerStyle: React.CSSProperties = {
  borderColor: "#e9e3d6",
  borderStyle: "solid",
  borderWidth: "1px 0 0",
  margin: "24px 0 16px",
};

const footerStyle: React.CSSProperties = {
  fontSize: "12px",
  lineHeight: "1.6",
  color: "#6f6a5f",
  margin: 0,
};

const addressStyle: React.CSSProperties = {
  fontSize: "11px",
  lineHeight: "1.6",
  color: "#6f6a5f",
  margin: "12px 0 0",
};

export function MetisSuiteTemplate({
  preview,
  heading,
  intro,
  children,
  details,
  buttonLabel,
  url,
  expiry,
  footer = "Didn't request this email? You can safely ignore it.",
}: MetisSuiteTemplateProps) {
  return (
    <Html lang="en">
      <Head>
        <title>{heading}</title>
        <meta name="color-scheme" content="light dark" />
        <meta name="supported-color-schemes" content="light dark" />
        {/* oxlint-disable-next-line react/no-danger --static stylesheet, no interpolation */}
        <style dangerouslySetInnerHTML={{ __html: darkModeCss }} />
      </Head>
      <Preview>{preview}</Preview>
      <Body style={bodyStyle} className="m-body">
        <Container style={containerStyle} className="m-card">
          <Section style={brandRowStyle}>
            <Row>
              <Column width={28} style={markCellStyle} className="m-mark" data-skip-in-text="true">
                M
              </Column>
              <Column style={wordmarkCellStyle} className="m-wordmark">
                Metis Suite
              </Column>
            </Row>
          </Section>

          <Heading as="h1" style={headingStyle} className="m-heading">
            {heading}
          </Heading>

          {intro ? (
            <Text style={introStyle} className="m-text">
              {intro}
            </Text>
          ) : null}
          {children}

          {details?.length ? (
            <Section style={detailsStyle}>
              {details.map((detail) => (
                <Text key={detail.label} style={detailLineStyle} className="m-text">
                  <span style={detailLabelStyle} className="m-muted">
                    {detail.label}
                  </span>{" "}
                  {detail.value}
                </Text>
              ))}
            </Section>
          ) : null}

          <Button href={url} style={buttonStyle}>
            {buttonLabel}
          </Button>

          {expiry ? (
            <Text style={expiryStyle} className="m-muted">
              {expiry}
            </Text>
          ) : null}

          <Text style={fallbackStyle} className="m-muted" data-skip-in-text="true">
            If the button doesn&apos;t work, paste this URL into your browser:
            <br />
            <span style={urlStyle} className="m-url">
              {url}
            </span>
          </Text>

          <Hr style={dividerStyle} className="m-divider" />

          <Text style={footerStyle} className="m-muted">
            {footer}
          </Text>
          <Text style={addressStyle} className="m-muted">
            AstraQ Cyber Defence Pvt Ltd · Mothi Umri, Akola, Maharashtra, India, 444001
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
