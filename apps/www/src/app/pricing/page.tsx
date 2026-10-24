import { PageJsonLd } from "@/components/json-ld";
import { Faq } from "@/components/site/faq";
import { PriceList } from "@/components/site/price-list";
import { pageMetadata } from "@/lib/metadata";

export const metadata = pageMetadata("/pricing");

export default function PricingPage() {
  return (
    <>
      <PageJsonLd path="/pricing" />
      <PriceList />
      <Faq />
    </>
  );
}
