import { GridCard } from "@/components/content-grid";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/utils/api";
import { Folder, Heart } from "lucide-react";
import { memo, useState } from "react";
import { StoreMeta } from "@/components/store-meta";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { resolveIcon } from "@/lib/icons";
import { useStrictEffect } from "@/utils/hooks/useStrictEffect";

function CategoriesPage() {
  const { t } = useTranslation();
  const [displayItems, setDisplayItems] = useState([
    {
      id: 1,
      title: "Wishlist",
      subtitle: "Save your favorites",
      image: null,
      icon: Heart,
      theme: "amber",
      size: "small",
    },
  ]);

  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  const handleCardClick = (id) => {
    if (id) {
      navigate(`/search?transform=true&category=${id}`);
    }
  };

  useStrictEffect(() => {
    api.client
      .get(api.categories())
      .then((response) => {
        const parsedData = response.data.map((item) => {
          return {
            id: item.id,
            title: item.name,
            subtitle:
              item.description ||
              t("categories.noDescription", "No description available"),
            image: item.image || item.Logo || null,
            /* Resolved from the curated, statically analysable icon registry
             * (src/lib/icons.jsx) — importing lucide's dynamic maps pulls in
             * every icon module and floods the network with requests. */
            icon: item.icon ? resolveIcon(item.icon) : Folder,
            theme: "default",
            size: "small",
          };
        });
        setDisplayItems(parsedData);
        setIsLoading(false);
      })
      .catch((error) => {
        console.error("Error fetching categories:", error);
        setIsLoading(false);
        setDisplayItems([]);
      });
  }, [t]);

  return (
    <div className="min-h-screen p-3 sm:p-7 max-sm:p-4 max-sm:mt-3">
      <StoreMeta
        title={t("categories.title")}
        description={t("categories.subtitle")}
        keywords={`categories, ${t("store.name")}, products, shopping, electronics, home, fashion`}
      />

      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <header className="mb-6">
          <h1 className="text-3xl font-bold mb-2">{t("categories.title")}</h1>
          <p className="text-gray-600">{t("categories.subtitle")}</p>
        </header>

        {/* Category List */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5 auto-rows-fr">
          {isLoading ? (
            <>
              <Skeleton className="h-52 w-full rounded-2xl" />
              <Skeleton className="h-52 w-full rounded-2xl" />
              <Skeleton className="h-52 w-full rounded-2xl" />
              <Skeleton className="h-52 w-full rounded-2xl" />
              <Skeleton className="h-52 w-full rounded-2xl" />
              <Skeleton className="h-52 w-full rounded-2xl" />
              <Skeleton className="h-52 w-full rounded-2xl" />
              <Skeleton className="h-52 w-full rounded-2xl" />
            </>
          ) : displayItems.length === 0 ? (
            <p className="text-gray-500 col-span-full text-center">
              {t("categories.noCategories")}
            </p>
          ) : (
            displayItems.map((item) => (
              <GridCard
                key={item.id}
                item={item}
                /* Card titles sit directly under the page <h1> here, so they
                 * are h2s; inside a titled section (home page) h3 is right. */
                titleAs="h2"
                onClick={() => {
                  handleCardClick(item.id);
                }}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default memo(CategoriesPage);
