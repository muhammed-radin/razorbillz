import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card"
import {
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"

export default function PricingInventorySection({ form }) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Pricing & Inventory</CardTitle>
                <CardDescription>
                    Set the pricing and stock information
                </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-6 md:grid-cols-3">
                <FormField
                    control={form.control}
                    name="price"
                    rules={{ required: "Price is required", min: { value: 0, message: "Price must be positive" } }}
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Selling Price *</FormLabel>
                            <FormControl>
                                <Input type="number" step="0.01" placeholder="0.00" {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="originalPrice"
                    rules={{ required: "Original price is required" }}
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Original Price (MRP) *</FormLabel>
                            <FormControl>
                                <Input type="number" step="0.01" placeholder="0.00" {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="tax"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Tax (%)</FormLabel>
                            <FormControl>
                                <Input type="number" step="0.01" placeholder="0" {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="taxExcluded"
                    render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0 md:col-span-3">
                            <FormControl>
                                <Checkbox
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                />
                            </FormControl>
                            <div className="space-y-1 leading-none">
                                <FormLabel>Exclude tax from price</FormLabel>
                                <FormDescription>
                                    When checked, the tax percentage above is added on top of the selling price at checkout.
                                    Leave unchecked when the selling price already includes tax.
                                </FormDescription>
                            </div>
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="stock"
                    rules={{ required: "Stock is required" }}
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Stock Quantity *</FormLabel>
                            <FormControl>
                                <Input type="number" placeholder="0" {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="currency"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Currency</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select currency" />
                                    </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                    <SelectItem value="INR">INR (₹)</SelectItem>
                                    <SelectItem value="USD">USD ($)</SelectItem>
                                    <SelectItem value="EUR">EUR (€)</SelectItem>
                                </SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="isActive"
                    render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0 pt-6">
                            <FormControl>
                                <Checkbox
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                />
                            </FormControl>
                            <div className="space-y-1 leading-none">
                                <FormLabel>Active</FormLabel>
                                <FormDescription>
                                    Product is visible to customers
                                </FormDescription>
                            </div>
                        </FormItem>
                    )}
                />
            </CardContent>
        </Card>
    )
}
