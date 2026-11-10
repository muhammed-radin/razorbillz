/**
 * Storefront video player.
 * ---------------------------------------------------------------------------
 * Lazy-loaded (see the product page) so Vidstack's runtime + CSS never touch
 * the initial bundle. Only product pages that actually have a video pay for it.
 */
import { MediaPlayer, MediaProvider, Poster } from "@vidstack/react";
import {
  DefaultVideoLayout,
  defaultLayoutIcons,
} from "@vidstack/react/player/layouts/default";
import "@vidstack/react/player/styles/default/theme.css";
import "@vidstack/react/player/styles/default/layouts/video.css";

import { cn } from "@/lib/utils";

export function ProductVideoPlayer({ src, poster, title, className }) {
  return (
    <MediaPlayer
      className={cn("h-full w-full bg-black", className)}
      src={src}
      poster={poster || undefined}
      title={title || "Product video"}
      playsInline
    >
      <MediaProvider>
        {poster ? <Poster className="vds-poster" src={poster} alt="" /> : null}
      </MediaProvider>
      <DefaultVideoLayout icons={defaultLayoutIcons} />
    </MediaPlayer>
  );
}

export default ProductVideoPlayer;
