import { type BarbershopListItem } from "@/data/barbershops";
import { resolveBarbershopImageUrl } from "@/lib/image-fallback";
import Image from "next/image";
import Link from "next/link";

interface BarbershopItemProps {
  barbershop: BarbershopListItem;
}

const BarbershopItem = ({ barbershop }: BarbershopItemProps) => {
  const baseHref = barbershop.isExclusive
    ? `/exclusive/${barbershop.id}`
    : `/barbershops/${barbershop.id}`;
  const barbershopHref = `${baseHref}?from=general_list`;
  const barbershopImageUrl = resolveBarbershopImageUrl(barbershop.imageUrl);

  return (
    <Link
      href={barbershopHref}
      className="relative min-h-[200px] min-w-[290px] rounded-xl"
    >
      <div className="absolute top-0 left-0 z-10 h-full w-full rounded-lg bg-linear-to-t from-black to-transparent" />
      <Image
        src={barbershopImageUrl}
        alt={barbershop.name}
        fill
        className="rounded-xl object-cover"
      />
      <div className="absolute right-0 bottom-0 left-0 z-20 p-4">
        <h3 className="text-background dark:text-foreground text-lg font-bold">
          {barbershop.name}
        </h3>
        <p className="text-background dark:text-foreground text-xs">
          {barbershop.address}
        </p>
      </div>
    </Link>
  );
};

export default BarbershopItem;
