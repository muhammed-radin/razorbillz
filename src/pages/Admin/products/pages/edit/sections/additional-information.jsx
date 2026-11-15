import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card"
import {
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { WARRANTY_OPTIONS, RETURN_POLICY_OPTIONS, SHIPPING_POLICY_OPTIONS } from "@/constants/policy-options"

export default function AdditionalInformationSection({ form }) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Additional Information</CardTitle>
                <CardDescription>
                    Warranty, returns and shipping details
                </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-6 md:grid-cols-1">
                <FormField
                    control={form.control}
                    name="warranty"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Warranty</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value || ""}>
                                <FormControl>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select warranty policy" />
                                    </SelectTrigger>
                                </FormControl>
                                <SelectContent className="max-h-52 overflow-y-auto">
                                    {WARRANTY_OPTIONS.map((option) => (
                                        <SelectItem key={option.value} value={option.value}>
                                            {option.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="returnPolicy"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Return Policy</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value || ""}>
                                <FormControl>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select return policy" />
                                    </SelectTrigger>
                                </FormControl>
                                <SelectContent className="max-h-52 overflow-y-auto">
                                    {RETURN_POLICY_OPTIONS.map((option) => (
                                        <SelectItem key={option.value} value={option.value}>
                                            {option.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="shippingDetails"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Shipping Details</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value || ""}>
                                <FormControl>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select shipping policy" />
                                    </SelectTrigger>
                                </FormControl>
                                <SelectContent className="max-h-52 overflow-y-auto">
                                    {SHIPPING_POLICY_OPTIONS.map((option) => (
                                        <SelectItem key={option.value} value={option.value}>
                                            {option.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                    )}
                />
            </CardContent>
        </Card>
    )
}
