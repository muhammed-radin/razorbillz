import React from "react";
import { Link } from "react-router-dom";
import { useStoreInfo } from "@/utils/store";

export const Logo = React.memo(({ className = "", ...props }) => {
  const store = useStoreInfo();

  return (
    <Link to="/" className="flex flex-row items-center gap-2">
      <div className="flex flex-row justify-center items-center">
        <img
          src="/logo.svg"
          alt={`${store.name} Logo`}
          className={`w-12 h-12 sm:w-8 sm:h-8 mr-2 ${className}`}
          {...props}
        />
        <h3 className="font-lg color-red font-semibold sm:font-normal font-bakbak font-[Bakbak_One]">
          {store.name}
        </h3>
      </div>
    </Link>
  );
});
