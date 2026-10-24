import { AcceptInner } from "./_components/accept-inner";

export default async function AcceptInvitePage(props: PageProps<"/invite/accept">) {
  const { token } = await props.searchParams;

  return <AcceptInner token={typeof token === "string" ? token : ""} />;
}
