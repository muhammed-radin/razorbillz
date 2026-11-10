import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Plus, Trash2 } from "lucide-react"
import ArrayImportDialog from "@/pages/Admin/products/components/array-import-dialog"

export default function FeaturesSection({ features, updateFeature, removeFeature, addFeature, onImport }) {
    return (
        <Card>
            <CardHeader className="flex flex-row items-start justify-between space-y-0">
                <div className="space-y-1.5">
                    <CardTitle>Features</CardTitle>
                    <CardDescription>
                        Add product features/highlights
                    </CardDescription>
                </div>
                {onImport && <ArrayImportDialog kind="features" onImport={onImport} />}
            </CardHeader>
            <CardContent className="space-y-4">
                {features.map((feature, index) => (
                    <div key={index} className="flex gap-2">
                        <Input
                            value={feature}
                            onChange={(e) => updateFeature(index, e.target.value)}
                            placeholder="Product feature"
                        />
                        <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            onClick={() => removeFeature(index)}
                        >
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    </div>
                ))}
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addFeature}
                >
                    <Plus className="mr-2 h-4 w-4" />
                    Add Feature
                </Button>
            </CardContent>
        </Card>
    )
}
