import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Upload,
  X,
  Trash2,
  Link as LinkIcon,
  XIcon,
  Check,
} from "lucide-react";

import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentGroup,
  AttachmentMedia,
  AttachmentTitle,
} from "@/components/ui/attachment";
import { Preloader } from "@/components/LoaderScreen";
import ProductVideosSection from "@/pages/Admin/products/components/product-videos-section";

export default function ImagesSection({
  thumbnail,
  setThumbnail,
  handleThumbnailUrlChange,
  handleThumbnailFileChange,
  thumbnailInputRef,
  additionalImages,
  removeAdditionalImage,
  updateAdditionalImageUrl,
  handleAdditionalImageFileChange,
  additionalImageInputRef,
  addAdditionalImageUrl,
  videos,
  setVideos,
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Resources</CardTitle>
        <CardDescription>
          Add product images and videos (upload or URL). Files upload when you
          save the product.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Thumbnail */}
        <div className="space-y-4">
          <Label>Thumbnail *</Label>
          <div className="flex gap-4 items-start">
            <div className="flex-1 space-y-2">
              <div className="flex gap-2">
                <Input
                  placeholder="https://example.com/image.jpg"
                  value={thumbnail.url}
                  onChange={(e) => handleThumbnailUrlChange(e.target.value)}
                />
                <input
                  type="file"
                  accept="image/*"
                  ref={thumbnailInputRef}
                  className="hidden"
                  onChange={handleThumbnailFileChange}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => thumbnailInputRef.current?.click()}
                >
                  <Upload className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Enter URL or upload from device
              </p>
            </div>
            {thumbnail.preview && (
              <div className="relative w-24 h-24 rounded-md overflow-hidden border">
                <img
                  src={thumbnail.preview}
                  alt="Thumbnail preview"
                  className="w-full h-full object-cover"
                />
                <Button
                  type="button"
                  variant="destructive"
                  size="icon"
                  className="absolute top-1 right-1 h-6 w-6"
                  onClick={() =>
                    setThumbnail({ url: "", file: null, preview: "" })
                  }
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Additional Images */}
        <div className="space-y-4">
          <Label>Additional Images</Label>
          <AttachmentGroup className="flex flex-wrap w-full flex-row gap-3">
            {additionalImages.map((img, index) => {
              let imagePreview = img.preview || img.url;
              let imageName =
                img.name || img.meta?.name || `Image ${index + 1}`;

              let imageSize = img.meta?.size
                ? `${(img.meta.size / 1024).toFixed(2)} KB`
                : img.file?.size
                  ? `${(img.file?.size / 1024).toFixed(2)} KB`
                  : "URL Image";
              let imageType = img.meta?.type || img.file?.type || "Image";

              return img.preview ? (
                <Attachment key={imageName} orientation="vertical">
                  <AttachmentMedia variant="image">
                    <img src={imagePreview} alt={imageName} />
                  </AttachmentMedia>
                  <AttachmentContent>
                    <AttachmentTitle>{imageName}</AttachmentTitle>
                    <AttachmentDescription>
                      {img.meta?.type || "Image"} -{" "}
                      {imageType && <span>{imageSize}</span>}
                    </AttachmentDescription>
                    <AttachmentActions>
                      <AttachmentAction
                        onClick={() => removeAdditionalImage(index)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </AttachmentAction>
                    </AttachmentActions>
                  </AttachmentContent>
                </Attachment>
              ) : (
                <div className="flex gap-2 items-center" key={index}>
                  <Input
                    value={img.url}
                    onChange={(e) => {
                      updateAdditionalImageUrl(index, e.target.value);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        updateAdditionalImageUrl(
                          index,
                          e.target.value,
                          e.key === "Enter" || e.keyCode === 13,
                        );
                      }
                    }}
                    placeholder="https://example.com/image.jpg"
                    className="w-64"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() =>
                      updateAdditionalImageUrl(index, img.url, true)
                    }
                  >
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => removeAdditionalImage(index)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              );
            })}
          </AttachmentGroup>
          <div className="flex gap-2">
            <input
              type="file"
              accept="image/*"
              multiple
              ref={additionalImageInputRef}
              className="hidden"
              onChange={handleAdditionalImageFileChange}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => additionalImageInputRef.current?.click()}
            >
              <Upload className="mr-2 h-4 w-4" />
              Upload Images
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addAdditionalImageUrl}
            >
              <LinkIcon className="mr-2 h-4 w-4" />
              Add URL
            </Button>
          </div>
        </div>

        {/* Videos */}
        <div className="border-t pt-6">
          <ProductVideosSection
            videos={videos || []}
            onChange={setVideos}
          />
        </div>
      </CardContent>
    </Card>
  );
}
