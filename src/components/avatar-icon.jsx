import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { decrypt } from "@/utils/crypt";
import React, { useMemo } from "react";

const AvatarIcon = ({ name, img, size = 40, className, imageClass }) => {
  const decryptedName = useMemo(() => {
    return decrypt(name);
  }, [name]);

  const initials = useMemo(() => {
    return decryptedName
      .split(" ")
      .map((part) => part[0]?.toUpperCase())
      .join("")
      .slice(0, 2);
  }, [decryptedName]);

  const decryptedImg = useMemo(() => {
    return decrypt(img);
  }, [img]);

  const image = useMemo(() => {
    return decryptedImg !== null
      ? decryptedImg
      : `https://api.dicebear.com/10.x/glyphs/svg?borderRadius=45&seed=${encodeURIComponent(initials)}`;
  }, [decryptedImg, initials, size]);

  return (
    <Avatar className={className}>
      <AvatarImage
        className={imageClass}
        src={image}
        alt={decryptedName}
        referrerPolicy="no-referrer"
      />
      <AvatarFallback>{initials}</AvatarFallback>
    </Avatar>
  );
};

export default React.memo(AvatarIcon);
