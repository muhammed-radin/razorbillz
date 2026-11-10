import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { Check, ChevronsUpDown, Plus, RefreshCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import StyledMd from "@/components/styled-md";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useRef, useState } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import CategoryCreatorModel from "@/components/category-creator-model";

import {
  MDXEditor,
  headingsPlugin,
  listsPlugin,
  quotePlugin,
  thematicBreakPlugin,
  markdownShortcutPlugin,
  toolbarPlugin,
  UndoRedo,
  BoldItalicUnderlineToggles,
  BlockTypeSelect,
  CodeToggle,
  CreateLink,
  InsertCodeBlock,
  InsertImage,
  ListsToggle,
  InsertTable,
  Separator,
  linkDialogPlugin,
  imagePlugin,
  diffSourcePlugin,
  DiffSourceToggleWrapper,
  tablePlugin,
} from "@mdxeditor/editor";
import "@mdxeditor/editor/style.css";
import { basicDark } from "cm6-theme-basic-dark";

export default function BasicInformationSection({
  form,
  categories,
  categoryOpen,
  setCategoryOpen,
  addNewCategory,
  loadCategories,
}) {
  const [isLoadingCategories, setIsLoadingCategories] = useState(false);
  const [isCategoryCreateModelOpen, setCategoryCreateModel] = useState(false);
  const [categorySearch, setCategorySearch] = useState("");

  const categorySearchInput = useRef(null);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Basic Information</CardTitle>
          <CardDescription>
            Enter the basic details of your product
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 md:grid-cols-2">
          <FormField
            control={form.control}
            name="id"
            rules={{ required: "Product ID is required" }}
            render={({ field }) => (
              <FormItem>
                <FormLabel>Product ID *</FormLabel>
                <FormControl>
                  <Input placeholder="unique-product-id" {...field} />
                </FormControl>
                <FormDescription>
                  Unique identifier for the product{" "}
                  <Button
                    size="sm"
                    variant="link"
                    className="ml-2 mt-2"
                    type="button"
                    onClick={() => {
                      const randomId = Math.random()
                        .toString(36)
                        .substring(2, 10);
                      field.onChange(randomId);
                    }}
                  >
                    Random ID <RefreshCcw className="mr-2 h-4 w-4" />
                  </Button>
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="sku"
            render={({ field }) => (
              <FormItem>
                <FormLabel>SKU</FormLabel>
                <FormControl>
                  <Input
                    placeholder="MENS-SHIRT-RED-ME / 111 222 33"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="title"
            rules={{ required: "Title is required" }}
            render={({ field }) => (
              <FormItem className="md:col-span-2">
                <FormLabel>Title *</FormLabel>
                <FormControl>
                  <Input placeholder="Product name" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="brand"
            rules={{ required: "Brand is required" }}
            render={({ field }) => (
              <FormItem>
                <FormLabel>Brand *</FormLabel>
                <FormControl>
                  <Input placeholder="Brand name" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          {/* Category Combobox */}
          <FormField
            control={form.control}
            name="category"
            rules={{ required: "Category is required" }}
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>Category *</FormLabel>
                <Popover
                  open={categoryOpen}
                  onOpenChange={(bool) => {
                    if (bool) {
                      setIsLoadingCategories(true);
                      loadCategories()
                        .then(() => setIsLoadingCategories(false))
                        .catch(() => setIsLoadingCategories(false));
                    }
                    setCategoryOpen(bool);
                  }}
                >
                  <PopoverTrigger asChild>
                    <FormControl>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={categoryOpen}
                        className={cn(
                          "justify-between",
                          !field.value && "text-muted-foreground",
                        )}
                      >
                        {field.value || "Select a category"}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </FormControl>
                  </PopoverTrigger>
                  <PopoverContent className="w-[300px] p-0">
                    <Command>
                      <CommandInput
                        placeholder="Search or add category..."
                        value={categorySearch}
                        onValueChange={setCategorySearch}
                        ref={categorySearchInput}
                      />
                      <CommandList>
                        {!isLoadingCategories && (
                          <CommandEmpty>
                            <div className="p-2">
                              <p className="text-sm text-muted-foreground mb-2">
                                No category found.
                              </p>

                              {categorySearch && (
                                <Button
                                  type="button"
                                  size="sm"
                                  onClick={() => {
                                    field.onChange(categorySearch);
                                    setCategorySearch("");
                                    setCategoryOpen(false);
                                    setCategoryCreateModel(true);
                                  }}
                                >
                                  <Plus className="mr-2 h-4 w-4" />
                                  Add "{categorySearch}"
                                </Button>
                              )}
                            </div>
                          </CommandEmpty>
                        )}
                        <CommandGroup>
                          {isLoadingCategories && (
                            <div className="space-y-1 p-1">
                              <Skeleton className="h-8 w-full bg-background" />
                              <Skeleton className="h-8 w-full bg-background" />
                              <Skeleton className="h-8 w-full bg-background" />
                              <Skeleton className="h-8 w-full bg-background" />
                            </div>
                          )}
                          {!isLoadingCategories &&
                            categories.map((category) => (
                              <CommandItem
                                key={category.name}
                                value={category.id}
                                onSelect={() => {
                                  field.onChange(category.id);
                                  setCategoryOpen(false);
                                }}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    field.value === category.id
                                      ? "opacity-100"
                                      : "opacity-0",
                                  )}
                                />
                                {category.name}
                              </CommandItem>
                            ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="description"
            rules={{ required: "Description is required" }}
            render={({ field }) => (
              <FormItem className="md:col-span-2">
                <FormLabel>Short Description *</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Brief description of the product"
                    className="min-h-[100px]"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          {/* Detailed Description with Markdown Editor */}
          <FormField
            control={form.control}
            name="detailedDescription"
            render={({ field }) => (
              <FormItem className="md:col-span-2">
                <FormLabel>Detailed Description</FormLabel>
                <FormControl>
                  <Tabs defaultValue="write" className="w-full">
                    <TabsList>
                      <TabsTrigger value="write">Write</TabsTrigger>
                      <TabsTrigger value="preview">Preview</TabsTrigger>
                    </TabsList>
                    <TabsContent value="write">
                      {/* <Textarea
                        placeholder="Write detailed description using Markdown..."
                        className="min-h-[200px] font-mono"
                        {...field}
                      /> */}
                      <MDXEditor
                        markdown={field.value}
                        className="min-h-[200px] font-mono bg-background rounded-xl p-1 border border-border/50 dark:bg-background dark:border-border/30 dark"
                        onChange={field.onChange}
                        contentEditableClassName="markdown-style"
                        placeholder="Write detailed description using Markdown..."
                        plugins={[
                          headingsPlugin(),
                          listsPlugin(),
                          quotePlugin(),
                          tablePlugin(),
                          thematicBreakPlugin(),
                          markdownShortcutPlugin(),
                          linkDialogPlugin(),
                          imagePlugin(),
                          diffSourcePlugin({
                            diffMarkdown: "",
                            viewMode: "rich-text",
                            codeMirrorExtensions: [basicDark],
                          }),
                          toolbarPlugin({
                            toolbarClassName: "flex flex-wrap gap-2",
                            toolbarContents: () => (
                              <>
                                <DiffSourceToggleWrapper>
                                  <UndoRedo />
                                </DiffSourceToggleWrapper>
                                <BoldItalicUnderlineToggles />
                                <BlockTypeSelect />
                                <CreateLink />
                                <InsertImage />
                                <InsertTable />
                                <ListsToggle />
                                <Separator />
                              </>
                            ),
                          }),
                        ]}
                      ></MDXEditor>
                    </TabsContent>
                    <TabsContent value="preview">
                      <div className="min-h-[200px] rounded-md border p-4 prose prose-sm dark:prose-invert max-w-none">
                        {field.value ? (
                          <StyledMd>{field.value}</StyledMd>
                        ) : (
                          <p className="text-muted-foreground">
                            Nothing to preview
                          </p>
                        )}
                      </div>
                    </TabsContent>
                  </Tabs>
                </FormControl>
                <FormDescription>
                  Supports Markdown formatting (bold, italic, lists, links,
                  etc.)
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </CardContent>
      </Card>

      {/* Category creator dialog model */}
      <CategoryCreatorModel
        isCategoryCreateModelOpen={isCategoryCreateModelOpen}
        setCategoryCreateModel={setCategoryCreateModel}
        categorySearchInputValue={categorySearchInput.current?.value}
        onAddCategory={addNewCategory}
      />
    </>
  );
}
