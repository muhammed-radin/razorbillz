import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ArrowRight,
  ArrowUpRight,
  LayoutGrid,
  Smartphone,
  Laptop,
  Camera,
  Headphones,
  Gamepad2,
  Cpu,
  Lightbulb,
  Cable,
  Tv,
  Watch,
  Speaker,
  Drone,
  Plug,
  Battery,
  Dumbbell,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Reveal, SectionHeading } from "./Reveal";
import { cn } from "@/lib/utils";

const iconMap = {
  grid: LayoutGrid,
  all: LayoutGrid,
  smartphone: Smartphone,
  phone: Smartphone,
  phones: Smartphone,
  mobile: Smartphone,
  laptop: Laptop,
  laptops: Laptop,
  computer: Laptop,
  camera: Camera,
  cameras: Camera,
  drone: Drone,
  headphones: Headphones,
  headphone: Headphones,
  audio: Speaker,
  speaker: Speaker,
  gaming: Gamepad2,
  game: Gamepad2,
  cpu: Cpu,
  components: Cpu,
  component: Cpu,
  electronics: Cpu,
  bulb: Lightbulb,
  smart: Lightbulb,
  cable: Cable,
  accessories: Cable,
  accessory: Cable,
  tv: Tv,
  watch: Watch,
  plug: Plug,
  battery: Battery,
  dumbbell: Dumbbell,
};

function iconFor(c) {
  const key = String(c.icon || c.id || c.name || "").toLowerCase();
  for (const [k, Icon] of Object.entries(iconMap)) {
    if (key.includes(k)) return Icon;
  }
  return LayoutGrid;
}

// Live categories only — icon tiles, no stock imagery.
export default function CategoryShowcase({ categories, loading }) {
  const { t } = useTranslation();
  if (!loading && (!categories || categories.length === 0)) return null;
  const tiles = (categories || []).slice(0, 6);

  return (
    <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10 sm:py-16">
      <SectionHeading
        eyebrow={t("homepage.categories.eyebrow")}
        title={t("homepage.categories.title")}
        description={t("homepage.categories.description")}
        action={
          <Button variant="outline" className="rounded-xl" asChild>
            <Link to="/categories">
              {t("homepage.categories.all")} <ArrowRight className="size-4" />
            </Link>
          </Button>
        }
      />
      {loading ? (
        <div className="grid gap-3 sm:gap-4 md:grid-cols-4 md:grid-rows-2 md:h-[460px]">
          <Skeleton className="h-52 sm:h-60 md:h-full rounded-3xl md:col-span-2 md:row-span-2" />
          <Skeleton className="h-52 sm:h-60 md:h-full rounded-3xl" />
          <Skeleton className="h-52 sm:h-60 md:h-full rounded-3xl" />
          <Skeleton className="h-52 sm:h-60 md:h-full rounded-3xl md:row-span-2" />
          <Skeleton className="h-52 sm:h-60 md:h-full rounded-3xl" />
          <Skeleton className="h-52 sm:h-60 md:h-full rounded-3xl" />
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:gap-4 md:grid-cols-4 md:grid-rows-2 md:h-[460px]">
            {tiles.map((c, i) => {
              const Icon = iconFor(c);
              const id = c.id || c._id || c.name;
              const big = i === 0;
              const tall = i === 3;
              const hasImages = c.image || c.Logo;
              return (
                <Reveal
                  key={id}
                  delay={i * 70}
                  className={
                    big
                      ? "md:col-span-2 md:row-span-2"
                      : tall
                        ? "md:row-span-2"
                        : ""
                  }
                >
                  <Link
                    to={`/search?transform=true&category=${encodeURIComponent(id)}`}
                    style={
                      hasImages
                        ? {
                            backgroundImage: `url(${c.image || c.Logo})`,
                            backgroundSize: "cover",
                            backgroundPosition: "center",
                          }
                        : {}
                    }
                    className={cn(
                      "group relative flex h-52 sm:h-60 md:h-full flex-col justify-end overflow-hidden rounded-3xl border bg-gradient-to-br from-muted/80 via-card to-muted/40 p-4 sm:p-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl",
                      hasImages
                        ? "bg-no-repeat bg-center shadow-[inset_-1px_-140px_0px_0px_var(--background)] transition-shadow duration-500 hover:shadow-[inset_-1px_-120px_0px_0px_var(--background)] "
                        : "",
                    )}
                  >
                    <div className="absolute -right-8 -top-8 size-32 rounded-full bg-primary/5 blur-2xl transition-all group-hover:bg-primary/10" />
                    <div className="absolute top-3 right-3 grid size-9 place-items-center rounded-full border bg-background text-foreground opacity-0 group-hover:opacity-100 transition">
                      <ArrowUpRight className="size-4" />
                    </div>
                    <span
                      className={`grid place-items-center rounded-2xl bg-primary text-primary-foreground shadow-md transition-transform group-hover:scale-110 group-hover:-rotate-6 ${big ? "size-14" : "size-11"}`}
                    >
                      <Icon className={big ? "size-7" : "size-5"} />
                    </span>
                    <h3
                      className={`mt-4 font-extrabold tracking-tight ${big ? "text-2xl sm:text-3xl" : "text-lg sm:text-xl"}`}
                    >
                      {c.name}
                    </h3>
                    {c.description && big && (
                      <p className="mt-1 text-sm text-muted-foreground line-clamp-2 max-w-xs">
                        {c.description}
                      </p>
                    )}
                    <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground group-hover:text-foreground">
                      {t("homepage.categories.explore")}{" "}
                      <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-1" />
                    </span>
                  </Link>
                </Reveal>
              );
            })}
          </div>
          <div className="mt-4 flex gap-2 overflow-x-auto pb-1 md:hidden [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {tiles.map((c) => {
              const id = c.id || c._id || c.name;
              return (
                <Link
                  key={id + "-chip"}
                  to={`/search?transform=true&category=${encodeURIComponent(id)}`}
                  className="shrink-0 rounded-full border bg-background px-4 py-2 text-xs font-semibold"
                >
                  {c.name}
                </Link>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
