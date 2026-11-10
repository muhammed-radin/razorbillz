import { create } from "zustand";

// Search filter state shared by SearchPage + filter sidebar.
// (Lives here so Fast Refresh keeps working in page files.)
const useStore = create((set) => ({
  searchQuery: "",
  selectedCategory: "all",
  sortBy: "relevance",
  priceRange: [0, 50000],
  minRating: 0,
  showOnlyInStock: false,
  showFilters: false,
  fixedPriceRange: [0, 50000],
  setShowFilters: (show) => set({ showFilters: show }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setSelectedCategory: (category) => set({ selectedCategory: category }),
  setSortBy: (sort) => set({ sortBy: sort }),
  setPriceRange: (range) => set({ priceRange: range }),
  setMinRating: (rating) => set({ minRating: rating }),
  setShowOnlyInStock: (inStock) => set({ showOnlyInStock: inStock }),
  setFixedPriceRange: (range) => set({ fixedPriceRange: range }),
}));

export { useStore };
export default useStore;
