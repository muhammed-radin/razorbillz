import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import CategoryTag from "./CategoryTag";
import React from "react";
import { cn } from "@/lib/utils";
import { api } from "@/utils/api";
import { Skeleton } from "../ui/skeleton";

export default function CategoryList(params) {
  const AllCategory = {
    id: "all",
    name: "All",
    icon: "grid",
    description: "All Categories",
  };

  const defaultCategories = [
    AllCategory,
    {
      id: "electronics",
      name: "Electronics",
      icon: "tv",
      description: "Electronic Devices",
    },
    {
      id: "smartphones",
      name: "Smartphones",
      icon: "smartphone",
      description: "Smartphones and Accessories",
    },
    {
      id: "laptops",
      name: "Laptops",
      icon: "laptop",
      description: "Laptops and Accessories",
    },
    {
      id: "cameras",
      name: "Cameras",
      icon: "camera",
      description: "Cameras and Photography Equipment",
    },
    {
      id: "headphones",
      name: "Headphones",
      icon: "headphones",
      description: "Headphones and Audio Equipment",
    },
  ];
  const [categories, setCategories] = useState(defaultCategories);
  const [loading, setLoading] = useState(true);

  const fetchCategories = async () => {
    if (loading == false) setLoading(true);
    try {
      const response = await api.client.get("/api/categories?limit=13");
      const fetchedCategories = response.data;
      if (!fetchedCategories || fetchedCategories.length === 0) {
        setCategories(defaultCategories);
      } else {
        setCategories([AllCategory, ...fetchedCategories]);
      }
      setLoading(false);
    } catch (error) {
      console.error("Error fetching categories:", error);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  const navigate = useNavigate();

  const [active, setActive] = useState("All");

  const handleCategoryClick = (category) => {
    setActive(category);
    if (category === "All") {
      navigate("/search");
    } else {
      navigate(
        `/search?transform=true&category=${encodeURIComponent(category)}`,
      );
    }
  };

  return (
    <>
      <div className={cn("p-4 flex gap-3 flex-wrap", params.className)}>
        {loading ? (
          <>
            <Skeleton className="h-8 w-20 rounded-md" />
            <Skeleton className="h-8 w-18 rounded-md" />
            <Skeleton className="h-8 w-23 rounded-md" />
            <Skeleton className="h-8 w-20 rounded-md" />
            <Skeleton className="h-8 w-26 rounded-md" />
            <Skeleton className="h-8 w-20 rounded-md" />
            <Skeleton className="h-8 w-12 rounded-md" />
            <Skeleton className="h-8 w-20 rounded-md" />
          </>
        ) : (
          <>
            {categories.map((category) => (
              <CategoryTag
                key={category.id}
                label={
                  category.name === "All" ? (
                    <Link to={`/search`}>All</Link>
                  ) : (
                    <Link to={`/search?transform=true&category=${category.id}`}>
                      {category.name}
                    </Link>
                  )
                } // Use Link component with the correct route category.name}
                selected={active === category.name}
                className={params.tagClassName}
              />
            ))}
            <CategoryTag
              label={<Link to={`/categories`}>View More</Link>} // Use Link component with the correct route category.name}
              selected={false}
              className={cn(
                params.tagClassName,
                "border bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            />
          </>
        )}
      </div>
    </>
  );
}
