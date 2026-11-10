import mongoose, { Schema } from "mongoose";

export const AddressSchema = new Schema({
  // currently unusable, instead use AddressMold to create new address objects and then save on user profile property addressBook array.
  id: { type: String, required: true, unique: false },
  userId: { type: String, required: true },
  name: { type: String, required: true },
  street: { type: String, required: true },
  type: { type: String, required: true, default: "home" }, // home, office, other
  city: { type: String, required: true },
  state: { type: String, required: true },
  postalCode: { type: String, required: true },
  country: { type: String, required: true },
  phoneNumber: { type: String, required: true },
  email: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  isActive: { type: Boolean, default: true },
});

class AddressMold {
  constructor({
    id,
    userId,
    name,
    street,
    city,
    state,
    postalCode,
    country,
    phoneNumber,
    email,
  }) {
    this.id = id;
    this.userId = userId;
    this.name = name;
    this.street = street;
    this.city = city;
    this.state = state;
    this.postalCode = postalCode;
    this.country = country;
    this.phoneNumber = phoneNumber;
    this.email = email;
    this.createdAt = new Date();
    this.updatedAt = new Date();
    this.isActive = true;
  }
}

export { AddressMold };
