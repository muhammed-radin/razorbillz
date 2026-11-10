import { useState, useRef, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { ArrowLeft, Plus, Save, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { api } from "@/utils/api";
import { toast } from "sonner";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

import BasicInformationSection from "./sections/basic-information";
import PricingInventorySection from "./sections/pricing-inventory";
import ImagesSection from "./sections/images";
import SpecificationsSection from "./sections/specifications";
import FeaturesSection from "./sections/features";
import DimensionsWeightSection from "./sections/dimensions-weight";
import TagsKeywordsSection from "./sections/tags-keywords";
import AdditionalInformationSection from "./sections/additional-information";
import { productSchema } from "@shared/utils/product_zod";
import ProductImportDialog from "@/pages/Admin/products/components/product-import-dialog";
import UploadTraceDialog from "@/pages/Admin/products/components/upload-trace-dialog";
import {
  buildUploadSteps,
  buildVideosPayload,
  uploadProductResources,
  videoItemFromDocument,
} from "@/utils/product-upload";

const defaultCategories = [];

const PRODUCT_IMAGES_DB = "productImagesDB";
const PRODUCT_IMAGES_DB_VERSION = 3;
const PRODUCT_IMAGES_STORE = "images";
const PRODUCT_VIDEOS_STORE = "videos";

function openImagesDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(
      PRODUCT_IMAGES_DB,
      PRODUCT_IMAGES_DB_VERSION,
    );

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      [PRODUCT_IMAGES_STORE, PRODUCT_VIDEOS_STORE].forEach((storeName) => {
        if (!db.objectStoreNames.contains(storeName)) {
          db.createObjectStore(storeName, {
            keyPath: "id",
            autoIncrement: true,
          });
        }
      });
    };

    request.onsuccess = (event) => {
      const db = event.target.result;

      const missingStores = [PRODUCT_IMAGES_STORE, PRODUCT_VIDEOS_STORE].filter(
        (storeName) => !db.objectStoreNames.contains(storeName),
      );

      if (missingStores.length) {
        db.close();
        indexedDB.deleteDatabase(PRODUCT_IMAGES_DB);

        const recreate = indexedDB.open(
          PRODUCT_IMAGES_DB,
          PRODUCT_IMAGES_DB_VERSION,
        );

        recreate.onupgradeneeded = (e) => {
          const recreatedDb = e.target.result;
          [PRODUCT_IMAGES_STORE, PRODUCT_VIDEOS_STORE].forEach((storeName) => {
            if (!recreatedDb.objectStoreNames.contains(storeName)) {
              recreatedDb.createObjectStore(storeName, {
                keyPath: "id",
                autoIncrement: true,
              });
            }
          });
        };

        recreate.onsuccess = (e) => resolve(e.target.result);
        recreate.onerror = () => reject(recreate.error);
        return;
      }

      resolve(db);
    };

    request.onerror = () => reject(request.error);
  });
}

export default function NewProductPage() {
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [specifications, setSpecifications] = useState([
    { label: "", value: "" },
  ]);
  const [features, setFeatures] = useState([""]);
  const [tags, setTags] = useState([]);
  const [keywords, setKeywords] = useState([]);
  const [tagInput, setTagInput] = useState("");
  const [keywordInput, setKeywordInput] = useState("");

  // Image states
  const [thumbnail, setThumbnail] = useState({
    url: "",
    file: null,
    preview: "",
    isThumbnail: true,
  });
  const [additionalImages, setAdditionalImages] = useState([]);
  // Videos are only *staged* here (File + local preview). Transcoding and
  // uploading happen on submit, one item at a time, with a live trace dialog.
  const [videos, setVideos] = useState([]);
  const [uploadTrace, setUploadTrace] = useState([]);
  const [traceOpen, setTraceOpen] = useState(false);

  async function saveImages() {
    const saveData = { data: [thumbnail, ...additionalImages], id: 0 };
    if (saveData.data.length === 0) return;

    try {
      const db = await openImagesDB();
      const transaction = db.transaction(PRODUCT_IMAGES_STORE, "readwrite");
      const store = transaction.objectStore(PRODUCT_IMAGES_STORE);
      store.put(saveData);
    } catch (error) {
      console.error("IndexedDB save error:", error);
      toast.warning("Failed to save images to DB");
    }
  }

  async function loadImages() {
    try {
      const db = await openImagesDB();
      const transaction = db.transaction(PRODUCT_IMAGES_STORE, "readonly");
      const store = transaction.objectStore(PRODUCT_IMAGES_STORE);
      const getAllRequest = store.getAll();

      getAllRequest.onsuccess = (event) => {
        const images = event.target.result;
        if (images.length > 0) {
          const saved = images[0].data || [];

          if (saved[0]?.isThumbnail) {
            setThumbnail(saved[0]);
          }

          const imagesData = saved.slice(1).map((image) => {
            if (image.file) {
              image.preview = URL.createObjectURL(image.file);
            }
            return image;
          });

          setAdditionalImages(imagesData);
        }
      };
    } catch (error) {
      console.error("IndexedDB load error:", error);
      toast.warning("Failed to load images from DB");
    }
  }

  async function clearImages() {
    try {
      const db = await openImagesDB();
      const transaction = db.transaction(PRODUCT_IMAGES_STORE, "readwrite");
      const store = transaction.objectStore(PRODUCT_IMAGES_STORE);
      await store.clear();
    } catch (error) {
      console.error("IndexedDB clear error:", error);
    }
  }

  const firstLoadRef = useRef(true);
  useEffect(() => {
    if (!thumbnail.url && !thumbnail.file && additionalImages.length === 0) {
      if (firstLoadRef.current) {
        loadImages();
        firstLoadRef.current = false;
      }
    } else {
      saveImages();
    }
  }, [thumbnail, additionalImages]);

  // Video drafts: a selected File stays in IndexedDB until it has been uploaded
  // (then only the URL is kept); pasted URLs are stored as-is.
  function serializeVideo(video) {
    return {
      id: video.id,
      name: video.name,
      source: video.source || "upload",
      url: video.url || "",
      poster: video.poster || "",
      duration: video.duration || 0,
      width: video.width || 0,
      height: video.height || 0,
      size: video.size || 0,
      encodedSize: video.encodedSize || 0,
      file: video.url ? null : video.file || null,
    };
  }

  async function saveVideos() {
    if (videos.length === 0) return;

    try {
      const db = await openImagesDB();
      const transaction = db.transaction(PRODUCT_VIDEOS_STORE, "readwrite");
      transaction
        .objectStore(PRODUCT_VIDEOS_STORE)
        .put({ id: 0, data: videos.map(serializeVideo) });
    } catch (error) {
      console.error("IndexedDB video save error:", error);
      toast.warning("Failed to save videos to DB");
    }
  }

  async function loadVideos() {
    try {
      const db = await openImagesDB();
      const transaction = db.transaction(PRODUCT_VIDEOS_STORE, "readonly");
      const request = transaction.objectStore(PRODUCT_VIDEOS_STORE).getAll();

      request.onsuccess = (event) => {
        const saved = event.target.result[0]?.data || [];

        if (saved.length) {
          setVideos(
            saved.map((video) => ({
              ...video,
              objectUrl: video.file ? URL.createObjectURL(video.file) : "",
              status: video.url
                ? "uploaded"
                : video.file
                  ? "ready"
                  : "draft",
              stage: video.url ? "done" : "reading",
              progress: video.url ? 1 : 0,
              error: "",
            })),
          );
        }
        draftLoadedRef.current = true;
      };
    } catch (error) {
      console.error("IndexedDB video load error:", error);
      draftLoadedRef.current = true;
      toast.warning("Failed to load videos from DB");
    }
  }

  async function clearVideos() {
    try {
      const db = await openImagesDB();
      const transaction = db.transaction(PRODUCT_VIDEOS_STORE, "readwrite");
      transaction.objectStore(PRODUCT_VIDEOS_STORE).clear();
    } catch (error) {
      console.error("IndexedDB video clear error:", error);
    }
  }

  const firstVideoLoadRef = useRef(true);
  const draftLoadedRef = useRef(false);

  useEffect(() => {
    if (firstVideoLoadRef.current) {
      firstVideoLoadRef.current = false;
      loadVideos();
    }
  }, []);

  /* Save drafts only when the sources change (add/remove/url), not on progress
   * ticks — otherwise a large File would be cloned into IndexedDB repeatedly. */
  const videoDraftKey = videos
    .map((video) =>
      [
        video.id,
        video.url,
        video.name,
        video.poster,
        video.duration,
        video.file?.name,
        video.file?.size,
        video.file?.lastModified,
      ].join("~"),
    )
    .join("|");

  useEffect(() => {
    if (!videoDraftKey) {
      if (draftLoadedRef.current) clearVideos();
      return;
    }

    const timer = setTimeout(() => saveVideos(), 500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoDraftKey]);

  // Category combobox states
  const [categories, setCategories] = useState(defaultCategories);
  const [categoryOpen, setCategoryOpen] = useState(false);

  const thumbnailInputRef = useRef(null);
  const additionalImageInputRef = useRef(null);

  const form = useForm({
    defaultValues: {
      id: "",
      title: "",
      price: 0,
      originalPrice: 0,
      thumbnail: "",
      description: "",
      category: "",
      stock: 0,
      brand: "",
      tax: 0,
      detailedDescription: "",
      rating: 0,
      reviewCount: 0,
      width: 0,
      height: 0,
      depth: 0,
      weight: 0,
      isActive: true,
      currency: "INR",
      warranty: "",
      returnPolicy: "",
      shippingDetails: "",
      sku: "",
    },
  });

  useEffect(() => {
    // load all inputs values from local storage on mount early stored if found
    if (localStorage.getItem("newProductForm")) {
      const savedValues = JSON.parse(localStorage.getItem("newProductForm"));
      form.reset(savedValues);
    }
    // save all inputs values to local storage on change
    const subscription = form.watch((value) => {
      let saveData = { ...value };
      localStorage.setItem("newProductForm", JSON.stringify(saveData));
    });

    return () => subscription.unsubscribe();
  }, [form]);

  const isLoadedFromLocalStorageRef = useRef(false);

  const clearLocalStorage = () => {
    localStorage.removeItem("newProductForm");
    localStorage.removeItem("arrayDataForm");
  };

  useEffect(() => {
    if (
      localStorage.getItem("arrayDataForm") &&
      !isLoadedFromLocalStorageRef.current
    ) {
      const savedValues = JSON.parse(localStorage.getItem("arrayDataForm"));
      setSpecifications(savedValues.specifications);
      setFeatures(savedValues.features);
      setTags(savedValues.tags);
      setKeywords(savedValues.keywords);
      isLoadedFromLocalStorageRef.current = true;
    }
    // Close the hydration gate after the first pass: otherwise a draft saved
    // by this very effect (e.g. the initial blank rows) would be re-read and
    // clobber the first real import/edits made by the user.
    isLoadedFromLocalStorageRef.current = true;

    if (
      specifications.length > 0 ||
      features.length > 0 ||
      tags.length > 0 ||
      keywords.length > 0
    ) {
      let arrData = {
        specifications: specifications,
        features: features,
        tags: tags,
        keywords: keywords,
      };
      localStorage.setItem("arrayDataForm", JSON.stringify(arrData));
    }
  }, [specifications, features, tags, keywords]);

  const loadCategories = async () => {
    try {
      const response = await api.client.get(api.categories());
      setCategories(response.data);
    } catch (error) {
      console.error("Error fetching categories:", error);
      toast.error("Failed to load categories");
    }
  };

  // Prevent form submission on Enter key
  const handleKeyDown = (e) => {
    if (e.key === "Enter" && e.target.tagName !== "TEXTAREA") {
      e.preventDefault();
    }
  };

  const addSpecification = () => {
    setSpecifications([...specifications, { label: "", value: "" }]);
  };

  const removeSpecification = (index) => {
    setSpecifications(specifications.filter((_, i) => i !== index));
  };

  const updateSpecification = (index, field, value) => {
    const updated = [...specifications];
    updated[index][field] = value;
    setSpecifications(updated);
  };

  const addFeature = () => {
    setFeatures([...features, ""]);
  };

  const removeFeature = (index) => {
    setFeatures(features.filter((_, i) => i !== index));
  };

  const updateFeature = (index, value) => {
    const updated = [...features];
    updated[index] = value;
    setFeatures(updated);
  };

  // Tag handling
  const handleTagInputKeyDown = (e) => {
    if (e.key === "Enter" || e.key === "," || e.key === " ") {
      e.preventDefault();
      addTagsFromInput();
    }
  };

  const addTagsFromInput = () => {
    const newTags = tagInput
      .split(/[,\s]+/)
      .map((t) => t.trim())
      .filter((t) => t && !tags.includes(t));
    if (newTags.length > 0) {
      setTags([...tags, ...newTags]);
    }
    setTagInput("");
  };

  const removeTag = (tagToRemove) => {
    setTags(tags.filter((t) => t !== tagToRemove));
  };

  // Keyword handling
  const handleKeywordInputKeyDown = (e) => {
    if (e.key === "Enter" || e.key === "," || e.key === " ") {
      e.preventDefault();
      addKeywordsFromInput();
    }
  };

  const addKeywordsFromInput = () => {
    const newKeywords = keywordInput
      .split(/[,\s]+/)
      .map((k) => k.trim())
      .filter((k) => k && !keywords.includes(k));
    if (newKeywords.length > 0) {
      setKeywords([...keywords, ...newKeywords]);
    }
    setKeywordInput("");
  };

  const removeKeyword = (keywordToRemove) => {
    setKeywords(keywords.filter((k) => k !== keywordToRemove));
  };

  // Image handling
  const handleThumbnailFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const preview = URL.createObjectURL(file);
      setThumbnail({
        url: "",
        file,
        preview,
        status: "uploading",
        isThumbnail: true,
      });
    }
  };

  const handleThumbnailUrlChange = (url) => {
    setThumbnail({
      url,
      file: null,
      preview: url,
      status: "uploaded",
      isThumbnail: true,
    });
  };

  const handleAdditionalImageFileChange = (e) => {
    const files = Array.from(e.target.files);
    const newImages = files.map((file) => ({
      url: "",
      file,
      preview: URL.createObjectURL(file),
      meta: { name: file.name, size: file.size, type: file.type },
    }));
    setAdditionalImages([...additionalImages, ...newImages]);
  };

  const addAdditionalImageUrl = () => {
    setAdditionalImages([
      ...additionalImages,
      {
        url: "",
        file: null,
        preview: "",
        meta: { name: "", size: 0, type: "" },
      },
    ]);
  };

  const updateAdditionalImageUrl = (index, url, confirm = false) => {
    const updated = [...additionalImages];
    updated[index] = {
      url,
      file: null,
      preview: confirm ? url : null,
      meta: { name: "", size: 0, type: "" },
    };
    setAdditionalImages(updated);
  };

  const removeAdditionalImage = (index) => {
    const updated = [...additionalImages];
    if (updated[index].preview && updated[index].file) {
      URL.revokeObjectURL(updated[index].preview);
    }
    updated.splice(index, 1);
    setAdditionalImages(updated);
  };

  // Add new category
  const addNewCategory = async (newCategory) => {
    if (newCategory && !categories.includes(newCategory)) {
      setCategories([...categories, newCategory]);
    }
  };

  const validateData = function (data) {
    // validate data using zod schema
    const validatedData = productSchema.safeParse(data);
    if (!validatedData.success) {
      setIsSubmitting(false);
      toast.warning("Validation failed");
      toast.warning(
        "At " +
          JSON.parse(validatedData.error.message)[0].path +
          ", Err: " +
          JSON.parse(validatedData.error.message)[0].message,
      );
    }

    return validatedData.success;
  };

  /* --- Document import (full-product .md/.json) ---------------------- */
  /* see docs/PRODUCT_MD_FORMAT.md — validated by the shared zod schema   */
  const applyProductImport = ({
    formValues,
    specifications: importedSpecs,
    features: importedFeatures,
    tags: importedTags,
    keywords: importedKeywords,
    images: importedImages,
    thumbnail: importedThumbnail,
    videos: importedVideos = [],
  }) => {
    form.reset({
      ...form.getValues(),
      ...formValues,
    });
    setSpecifications(
      importedSpecs.length
        ? [...importedSpecs, { label: "", value: "" }]
        : [{ label: "", value: "" }],
    );
    setFeatures(importedFeatures.length ? [...importedFeatures, ""] : [""]);
    setTags(importedTags);
    setKeywords(importedKeywords);
    if (importedThumbnail) {
      handleThumbnailUrlChange(importedThumbnail);
    }
    if (importedImages.length) {
      setAdditionalImages(
        importedImages.map((url) => ({
          url,
          file: null,
          preview: url,
          meta: { name: "Imported", size: 0, type: "" },
        })),
      );
    }
    if (importedVideos.length) {
      setVideos(
        importedVideos
          .map((video, index) => videoItemFromDocument(video, index))
          .filter(Boolean),
      );
    }
  };

  const importHandler = {
    specifications: (items, mode) =>
      setSpecifications(
        mode === "append"
          ? [...specifications.filter((s) => s.label || s.value), ...items]
          : [...items, { label: "", value: "" }],
      ),
    features: (items, mode) =>
      setFeatures(
        mode === "append"
          ? [...features.filter((f) => f.trim() !== ""), ...items]
          : [...items, ""],
      ),
  };

  /* --- Deferred uploads with a live trace ---------------------------- */
  const updateTraceStep = (id, values) =>
    setUploadTrace((prev) =>
      prev.map((step) => (step.id === id ? { ...step, ...values } : step)),
    );

  /**
   * Upload every staged file (thumbnail, additional images, videos) one at a
   * time. Returns the URLs/results so the submit handler can build the payload
   * without waiting for React state to settle.
   */
  const runUploads = async () => {
    const steps = buildUploadSteps({
      thumbnail,
      images: additionalImages,
      videos,
    });

    setUploadTrace(
      steps.map((step) => ({
        ...step,
        status: "pending",
        stage: "starting",
        progress: 0,
        error: "",
      })),
    );

    if (!steps.length) {
      return {
        ok: true,
        thumbnailUrl: thumbnail.url,
        images: new Map(),
        videos: new Map(),
      };
    }

    setTraceOpen(true);

    return uploadProductResources(steps, {
      onStep: updateTraceStep,
      onThumbnail: (url) => {
        if (thumbnail.preview?.startsWith("blob:")) {
          URL.revokeObjectURL(thumbnail.preview);
        }
        setThumbnail({
          url,
          file: null,
          preview: url,
          status: "uploaded",
          isThumbnail: true,
        });
      },
      onImage: (index, url) => {
        setAdditionalImages((prev) =>
          prev.map((image, imageIndex) =>
            imageIndex === index
              ? { url, file: null, preview: url, meta: image.meta }
              : image,
          ),
        );
      },
      onVideo: (videoId, video) => {
        setVideos((prev) =>
          prev.map((item) =>
            item.id === videoId
              ? {
                  ...item,
                  url: video.url,
                  poster: video.poster || item.poster,
                  duration: video.duration || item.duration,
                  width: video.width || item.width,
                  height: video.height || item.height,
                  source: "upload",
                  encodedSize: video.size || item.encodedSize,
                  status: "uploaded",
                  stage: "done",
                  progress: 1,
                }
              : item,
          ),
        );
      },
    });
  };

  const onSubmit = async (data) => {
    if (videos.some((video) => video.status === "reading")) {
      toast.warning("Wait for the video details to finish loading.");
      return;
    }
    if (videos.some((video) => video.status === "error")) {
      toast.warning("Remove the failed videos before saving.");
      return;
    }

    setIsSubmitting(true);

    try {
      const uploads = await runUploads();

      if (!uploads.ok) {
        toast.error(uploads.error?.message || "Resource upload failed.");
        return;
      }

      const thumbnailUrl = uploads.thumbnailUrl || thumbnail.url;
      const imageUrls = additionalImages
        .map(
          (image, index) =>
            image.url || uploads.images.get(`image-${index}`) || "",
        )
        .filter((url) => url && url.trim() !== "");

      const productData = {
        ...data,
        thumbnail: thumbnailUrl,
        specifications: specifications.filter((s) => s.label && s.value),
        features: features.filter((f) => f.trim() !== ""),
        images: imageUrls,
        videos: buildVideosPayload(videos, uploads.videos),
        tags: tags,
        keywords: keywords,
        dimensions: {
          width: parseFloat(data.width) || 0,
          height: parseFloat(data.height) || 0,
          depth: parseFloat(data.depth) || 0,
        },
        price: parseFloat(data.price) || 0,
        originalPrice: parseFloat(data.originalPrice) || 0,
        stock: parseInt(data.stock) || 0,
        tax: parseFloat(data.tax) || 0,
        weight: parseFloat(data.weight) || 0,
        rating: parseFloat(data.rating) || 4.5,
        reviewCount: parseInt(data.reviewCount) || 0,
      };

      if (!validateData(productData)) {
        return;
      }

      // Remove individual dimension fields
      delete productData.width;
      delete productData.height;
      delete productData.depth;

      // Final trace line: the upload screen stays open until the product is
      // actually stored, so a save failure is visible in the same place.
      const saveStepId = "save-product";
      const markSaveStep = (values) =>
        setUploadTrace((prev) =>
          prev.map((step) =>
            step.id === saveStepId ? { ...step, ...values } : step,
          ),
        );
      setUploadTrace((prev) => [
        ...prev.filter((step) => step.id !== saveStepId),
        {
          id: saveStepId,
          kind: "save",
          label: "Product details",
          status: "running",
          stage: "saving",
          progress: 0,
          error: "",
        },
      ]);
      setTraceOpen(true);

      try {
        const response = await api.client.post(
          api.products(
            "new/" +
              (form.getValues("id") ||
                data.id ||
                Math.floor(Math.random() * 1000000)),
          ),
          productData,
        );

        if (response.status === 200 || response.status === 201) {
          markSaveStep({ status: "done", stage: "saved", progress: 1 });
          toast.success("Product created successfully!");
          localStorage.removeItem("newProductForm");
          clearLocalStorage();
          clearImages();
          clearVideos();
          setTraceOpen(false);
          navigate("/auth/admin/products");
        } else {
          const message = response.data?.message || "Failed to create product";
          markSaveStep({ status: "error", stage: "error", error: message });
          toast.error(message);
        }
      } catch (error) {
        const message =
          error.response?.data?.message || "Failed to create product";
        markSaveStep({ status: "error", stage: "error", error: message });
        toast.error(message);
        console.error("Error creating product:", error);
      }
    } catch (error) {
      console.error("Error creating product:", error);
      toast.error(error.response?.data?.message || "Failed to create product");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}

      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/auth/admin/products">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Create Product</h1>
          <p className="text-muted-foreground">
            Add a new product to your inventory
          </p>
        </div>
        <div className="ml-auto">
          <ProductImportDialog onApply={applyProductImport} />
        </div>
      </div>

      <UploadTraceDialog
        open={traceOpen}
        steps={uploadTrace}
        running={isSubmitting}
        onClose={() => setTraceOpen(false)}
      />

      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          onKeyDown={handleKeyDown}
          className="space-y-6"
        >
          <Accordion
            defaultValue={["basic"]}
            type="single"
            className="space-y-4"
          >
            {/* Basic Information */}
            <AccordionItem value="basic">
              <AccordionTrigger>Basic Information</AccordionTrigger>
              <AccordionContent>
                <BasicInformationSection
                  form={form}
                  categories={categories}
                  categoryOpen={categoryOpen}
                  setCategoryOpen={setCategoryOpen}
                  addNewCategory={addNewCategory}
                  loadCategories={loadCategories}
                />
              </AccordionContent>
            </AccordionItem>

            {/* Pricing & Inventory */}
            <AccordionItem value="pricing">
              <AccordionTrigger>Pricing & Inventory</AccordionTrigger>
              <AccordionContent>
                <PricingInventorySection form={form} />
              </AccordionContent>
            </AccordionItem>

            {/* Images + videos */}
            <AccordionItem value="Resources">
              <AccordionTrigger>Resources</AccordionTrigger>
              <AccordionContent>
                <ImagesSection
                  thumbnail={thumbnail}
                  setThumbnail={setThumbnail}
                  handleThumbnailUrlChange={handleThumbnailUrlChange}
                  handleThumbnailFileChange={handleThumbnailFileChange}
                  thumbnailInputRef={thumbnailInputRef}
                  additionalImages={additionalImages}
                  removeAdditionalImage={removeAdditionalImage}
                  updateAdditionalImageUrl={updateAdditionalImageUrl}
                  handleAdditionalImageFileChange={
                    handleAdditionalImageFileChange
                  }
                  additionalImageInputRef={additionalImageInputRef}
                  addAdditionalImageUrl={addAdditionalImageUrl}
                  videos={videos}
                  setVideos={setVideos}
                />
              </AccordionContent>
            </AccordionItem>

            {/* Specifications */}
            <AccordionItem value="specifications">
              <AccordionTrigger>Specifications</AccordionTrigger>
              <AccordionContent>
                <SpecificationsSection
                  specifications={specifications}
                  updateSpecification={updateSpecification}
                  removeSpecification={removeSpecification}
                  addSpecification={addSpecification}
                  onImport={importHandler.specifications}
                />
              </AccordionContent>
            </AccordionItem>

            {/* Features */}
            <AccordionItem value="features">
              <AccordionTrigger>Features</AccordionTrigger>
              <AccordionContent>
                <FeaturesSection
                  features={features}
                  updateFeature={updateFeature}
                  removeFeature={removeFeature}
                  addFeature={addFeature}
                  onImport={importHandler.features}
                />
              </AccordionContent>
            </AccordionItem>

            {/* Dimensions & Weight */}
            <AccordionItem value="dimensions-weight">
              <AccordionTrigger>Dimensions & Weight</AccordionTrigger>
              <AccordionContent>
                <DimensionsWeightSection form={form} />
              </AccordionContent>
            </AccordionItem>

            {/* Tags & Keywords */}
            <AccordionItem value="tags-keywords">
              <AccordionTrigger>Tags & Keywords</AccordionTrigger>
              <AccordionContent>
                <TagsKeywordsSection
                  tagInput={tagInput}
                  setTagInput={setTagInput}
                  handleTagInputKeyDown={handleTagInputKeyDown}
                  addTagsFromInput={addTagsFromInput}
                  tags={tags}
                  removeTag={removeTag}
                  keywordInput={keywordInput}
                  setKeywordInput={setKeywordInput}
                  handleKeywordInputKeyDown={handleKeywordInputKeyDown}
                  addKeywordsFromInput={addKeywordsFromInput}
                  keywords={keywords}
                  removeKeyword={removeKeyword}
                />
              </AccordionContent>
            </AccordionItem>

            {/* Additional Information */}
            <AccordionItem value="additional-information">
              <AccordionTrigger>Additional Information</AccordionTrigger>
              <AccordionContent>
                <AdditionalInformationSection form={form} />
              </AccordionContent>
            </AccordionItem>

            {/* Submit Button */}
            <div className="flex justify-end gap-4">
              <Button type="button" variant="outline" asChild>
                <Link to="/auth/admin/products">Cancel</Link>
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    Create Product
                  </>
                )}
              </Button>
            </div>
          </Accordion>
        </form>
      </Form>
    </div>
  );
}
