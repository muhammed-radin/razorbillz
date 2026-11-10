import { Button } from "@/components/ui/button";
import { ArrowRight, Zap, Shield, Truck, Star } from "lucide-react";
import { Link } from "react-router-dom";
import HeroVisual, { HeroImage } from "./hero-visual";
import { useStoreInfo } from "@/utils/store";

const Hero = ({
  heading = "Power Your Innovation",
  subheading = "Premium Electronic Components",
  description = "Discover high-quality resistors, diodes, LEDs, sensors, and microcontrollers. Build your next project with confidence.",
  buttons = {
    primary: {
      text: "Shop Now",
      url: "/search",
    },
    secondary: {
      text: "Browse Categories",
      url: "/search",
    },
  },
}) => {
  const store = useStoreInfo();
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-background via-background to-accent/20 dark:to-accent/10">
      {/* Animated background elements - using transform for better performance */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Floating circles with transform positioning */}
        <div className="absolute w-72 h-72 bg-primary/10 rounded-full blur-3xl animate-pulse" style={{ top: '5%', left: '2%' }} />
        <div className="absolute w-96 h-96 bg-accent/20 rounded-full blur-3xl animate-pulse hero-delay-1000" style={{ bottom: '5%', right: '2%' }} />
        <div className="absolute top-1/2 left-1/2 w-[40vw] max-w-[600px] h-[40vw] max-h-[600px] bg-primary/5 rounded-full blur-3xl animate-pulse hero-delay-500" style={{ transform: 'translate(-50%, -50%)' }} />
        
        {/* Grid pattern overlay - extracted to CSS class */}
        <div className="absolute inset-0 hero-grid-pattern bg-[size:40px_40px]" />
      </div>

      <div className="container relative z-10 px-4 sm:px-6 lg:px-8 py-8 sm:py-6 md:py-8 lg:py-10">
        <div className="grid gap-8 lg:gap-12 lg:grid-cols-2 items-center">
          {/* Content Section */}
          <div className="flex flex-col items-center text-center lg:items-start lg:text-left space-y-6 sm:space-y-8">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm font-medium hero-animate-fade-in">
              <Zap className="w-4 h-4" />
              <span>{store.name} Store</span>
            </div>

            {/* Main Heading */}
            <div className="space-y-4">
              <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight hero-animate-slide-up">
                <span className="bg-gradient-to-r from-foreground via-foreground to-foreground/70 bg-clip-text">
                  {heading}
                </span>
              </h1>
              <p className="text-xl sm:text-2xl md:text-3xl font-semibold text-primary hero-animate-slide-up hero-delay-100">
                {subheading}
              </p>
            </div>

            {/* Description */}
            <p className="text-muted-foreground text-base sm:text-lg md:text-xl max-w-xl hero-animate-slide-up hero-delay-200">
              {description}
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto hero-animate-slide-up hero-delay-300">
              {buttons.primary && (
                <Button
                  asChild
                  size="lg"
                  className="group px-6 py-6 text-base sm:text-lg font-semibold shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105"
                >
                  <Link to={buttons.primary.url}>
                    {buttons.primary.text}
                    <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform duration-300" />
                  </Link>
                </Button>
              )}
              {buttons.secondary && (
                <Button
                  asChild
                  variant="outline"
                  size="lg"
                  className="px-6 py-6 text-base sm:text-lg font-semibold hover:bg-accent/50 transition-all duration-300 hover:scale-105"
                >
                  <Link to={buttons.secondary.url}>
                    {buttons.secondary.text}
                  </Link>
                </Button>
              )}
            </div>

            {/* Trust Badges */}
            <div className="flex flex-wrap justify-center lg:justify-start gap-6 pt-4 hero-animate-fade-in hero-delay-500">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Shield className="w-5 h-5 text-primary" />
                <span className="text-sm font-medium">Secure Checkout</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Truck className="w-5 h-5 text-primary" />
                <span className="text-sm font-medium">Fast Delivery</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Star className="w-5 h-5 text-primary fill-primary" />
                <span className="text-sm font-medium">Top Rated</span>
              </div>
            </div>
          </div>

          {/* Hero Image/Visual Section */}
          <HeroVisual />

        </div>
      </div>
    </section>
  );
};

export { Hero };