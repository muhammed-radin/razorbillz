export class CartItem {
  constructor(productId, product, quantity = 1) {
    this.id = `cart-${Date.now()}-${Math.random()}`;
    this.productId = productId;
    this.product = product;
    this.quantity = quantity;
    this.createdAt = new Date();
    this.updatedAt = new Date();
  }

  // Calculate total price for this cart item
  getTotalPrice() {
    return this.product.price * this.quantity;
  }

  // Calculate original total price (before discounts)
  getOriginalTotalPrice() {
    return this.product.originalPrice * this.quantity;
  }

  // Get savings amount
  getSavings() {
    return this.getOriginalTotalPrice() - this.getTotalPrice();
  }

  // Update quantity
  updateQuantity(newQuantity) {
    if (newQuantity > 0 && newQuantity <= this.product.stock) {
      this.quantity = newQuantity;
      this.updatedAt = new Date();
      return true;
    }
    return false;
  }
}

export class Cart {
  constructor() {
    this.items = [];
    this.createdAt = new Date();
    this.updatedAt = new Date();
  }

  // Add item to cart
  addItem(product, quantity = 1) {
    const existingItem = this.items.find(item => item.productId === product.id);
    
    if (existingItem) {
      const newQuantity = existingItem.quantity + quantity;
      if (newQuantity <= product.stock) {
        existingItem.updateQuantity(newQuantity);
        this.updatedAt = new Date();
        return existingItem;
      }
      return null; // Cannot add more than stock
    }

    if (quantity <= product.stock) {
      const cartItem = new CartItem(product.id, product, quantity);
      this.items.push(cartItem);
      this.updatedAt = new Date();
      return cartItem;
    }
    return null; // Cannot add more than stock
  }

  // Remove item from cart
  removeItem(cartItemId) {
    const index = this.items.findIndex(item => item.id === cartItemId);
    if (index > -1) {
      this.items.splice(index, 1);
      this.updatedAt = new Date();
      return true;
    }
    return false;
  }

  // Update item quantity
  updateItemQuantity(cartItemId, quantity) {
    const item = this.items.find(item => item.id === cartItemId);
    if (item) {
      return item.updateQuantity(quantity);
    }
    return false;
  }

  // Get total items count
  getTotalItemsCount() {
    return this.items.reduce((total, item) => total + item.quantity, 0);
  }

  // Get subtotal (sum of all item prices)
  getSubtotal() {
    return this.items.reduce((total, item) => total + item.getTotalPrice(), 0);
  }

  // Get original subtotal (before discounts)
  getOriginalSubtotal() {
    return this.items.reduce((total, item) => total + item.getOriginalTotalPrice(), 0);
  }

  // Get total savings
  getTotalSavings() {
    return this.getOriginalSubtotal() - this.getSubtotal();
  }

  // Calculate tax (assuming 18% GST for India)
  getTax(taxRate = 0.18) {
    return this.getSubtotal() * taxRate;
  }

  // Calculate shipping (free above certain amount)
  getShipping(freeShippingThreshold = 500) {
    return this.getSubtotal() >= freeShippingThreshold ? 0 : 50;
  }

  // Get final total (subtotal + tax + shipping)
  getTotal(taxRate = 0.18, freeShippingThreshold = 500) {
    return this.getSubtotal() + this.getTax(taxRate) + this.getShipping(freeShippingThreshold);
  }

  // Clear cart
  clear() {
    this.items = [];
    this.updatedAt = new Date();
  }

  // Check if cart is empty
  isEmpty() {
    return this.items.length === 0;
  }
}

export default { Cart, CartItem };