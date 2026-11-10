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

export default function SpecificationsSection({ specifications, updateSpecification, removeSpecification, addSpecification, onImport }) {
    return (
        <Card>
            <CardHeader className="flex flex-row items-start justify-between space-y-0">
                <div className="space-y-1.5">
                    <CardTitle>Specifications</CardTitle>
                    <CardDescription>
                        Add technical specifications
                    </CardDescription>
                </div>
                {onImport && <ArrayImportDialog kind="specifications" onImport={onImport} />}
            </CardHeader>
            <CardContent className="space-y-4">
                {specifications.map((spec, index) => (
                    <div key={index} className="flex gap-2">
                        <Input
                            value={spec.label}
                            onChange={(e) => updateSpecification(index, "label", e.target.value)}
                            placeholder="Specification name"
                            className="flex-1"
                        />
                        <Input
                            value={spec.value}
                            onChange={(e) => updateSpecification(index, "value", e.target.value)}
                            placeholder="Specification value"
                            className="flex-1"
                        />
                        <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            onClick={() => removeSpecification(index)}
                        >
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    </div>
                ))}
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addSpecification}
                >
                    <Plus className="mr-2 h-4 w-4" />
                    Add Specification
                </Button>
            </CardContent>
        </Card>
    )
}
