import Image from "next/image";
import Link from "next/link";

interface BarbershopItemData {
  id: string;
  name: string;
  address: string;
  imageUrl: string;
  slug: string;
}

interface BarbershopItemProps {
  barbershop: BarbershopItemData;
}

const BarbershopItem = ({ barbershop }: BarbershopItemProps) => {
  const barbershopHref = barbershop.slug
    ? `/b/${barbershop.slug}`
    : `/barbershops/${barbershop.id}`;

  return (
    <Link
      href={barbershopHref}
      className="relative min-h-[200px] min-w-[290px] rounded-xl"
    >
      <div className="absolute top-0 left-0 z-10 h-full w-full rounded-lg bg-linear-to-t from-black to-transparent" />
      <Image
        src={barbershop.imageUrl}
        alt={barbershop.name}
        fill
        className="rounded-xl object-cover"
        sizes="(max-width: 48rem) 85vw, 18rem"
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
