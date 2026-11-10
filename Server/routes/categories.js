import express from "express";
import { Category } from "../models/schema/categories.js";
import { globalMemory } from "../utils/cache-utils/global-cache.js";
import { requireAuth } from "../utils/middlewares/reqiuredAuth.js";
import { requireAdmin, requirePermission } from "../utils/middlewares/RBAC.js";
import {
  DatabaseDocumentEvent,
  dbEventNames,
  dbEvents,
} from "../utils/events.manage.js";

const router = express.Router();

/* GET users listing. */
router.get("/", function (req, res) {
  if (
    globalMemory?.getLocalMemory("categories") &&
    req.query?.realtime !== "true"
  ) {
    return res.json(globalMemory.getLocalMemory("categories"));
  }

  Category.find({})
    .then((categories) => {
      globalMemory.setLocalMemory("categories", categories, 60 * 60); // Cache for 1 hour
      res.json(categories);
    })
    .catch((err) => {
      console.error("Error fetching categories:", err);
      res.status(500).json({ error: "Failed to fetch categories" });
    });
});

router.post(
  "/",
  requireAuth,
  requireAdmin,
  requirePermission({
    categories: ["create"],
  }),
  function (req, res) {
    const { id, name, icon, Logo, description } = req.body;

    if (!id || !name) {
      return res.status(400).json({ error: "ID and name are required" });
    }

    const newCategory = new Category({
      id,
      name,
      icon: icon || "",
      Logo: Logo || "",
      description: description || "",
    });

    newCategory
      .save()
      .then((category) => {
        dbEvents.fire(
          dbEventNames.DOCUMENT_CREATED,
          new DatabaseDocumentEvent(
            dbEventNames.DOCUMENT_CREATED,
            "categories",
            category,
          ),
        );
        // Writes must invalidate the list cache or new categories stay invisible.
        globalMemory?.clearLocalMemory?.("categories");
        res.status(201).json(category);
      })
      .catch((err) => {
        console.error("Error creating category:", err);
        if (err?.code === 11000) {
          return res
            .status(409)
            .json({ error: "A category with this ID or name already exists" });
        }
        res.status(500).json({ error: "Failed to create category" });
      });
  },
);

router.get("/:id", function (req, res) {
  const categoryId = req.params.id;

  Category.findOne({ id: categoryId })
    .then((category) => {
      if (!category) {
        return res.status(404).json({ error: "Category not found" });
      }
      res.json(category);
    })
    .catch((err) => {
      console.error("Error fetching category:", err);
      res.status(500).json({ error: "Failed to fetch category" });
    });
});

router.put(
  "/:id",
  requireAuth,
  requireAdmin,
  requirePermission({
    categories: ["update", "create"],
  }),
  function (req, res) {
    const categoryId = req.params.id;
    const { name, icon, Logo, description } = req.body;

    Category.findOneAndUpdate(
      { id: categoryId },
      { name, icon, Logo, description },
      { returnDocument: "after" },
    )
      .then((updatedCategory) => {
        if (!updatedCategory) {
          return res.status(404).json({ error: "Category not found" });
        }
        dbEvents.fire(
          dbEventNames.DOCUMENT_UPDATED,
          new DatabaseDocumentEvent(
            dbEventNames.DOCUMENT_UPDATED,
            "categories",
            updatedCategory,
          ),
        );
        globalMemory?.clearLocalMemory?.("categories");
        res.json(updatedCategory);
      })
      .catch((err) => {
        console.error("Error updating category:", err);
        res.status(500).json({ error: "Failed to update category" });
      });
  },
);

router.delete(
  "/:id",
  requireAuth,
  requireAdmin,
  requirePermission({
    categories: ["delete"],
  }),
  function (req, res) {
    const categoryId = req.params.id;

    Category.findOneAndDelete({ id: categoryId })
      .then((deletedCategory) => {
        if (!deletedCategory) {
          return res.status(404).json({ error: "Category not found" });
        }
        dbEvents.fire(
          dbEventNames.DOCUMENT_DELETED,
          new DatabaseDocumentEvent(
            dbEventNames.DOCUMENT_DELETED,
            "categories",
            deletedCategory,
          ),
        );
        globalMemory?.clearLocalMemory?.("categories");
        res.json({ message: "Category deleted successfully" });
      })
      .catch((err) => {
        console.error("Error deleting category:", err);
        res.status(500).json({ error: "Failed to delete category" });
      });
  },
);

export default router;
