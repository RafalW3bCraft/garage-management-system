import { useState } from "react";
import { CarCard } from "@/components/CarCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, SlidersHorizontal } from "lucide-react";

export default function Cars() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedBrand, setSelectedBrand] = useState("all");
  const [priceRange, setPriceRange] = useState("all");
  const [fuelType, setFuelType] = useState("all");

  // Mock data - todo: remove mock functionality
  const carsForSale = [
    {
      id: "car-1",
      make: "Maruti Suzuki",
      model: "Swift",
      year: 2020,
      price: 550000,
      mileage: 45000,
      fuelType: "Petrol",
      location: "Mumbai, Maharashtra",
      image: "https://images.unsplash.com/photo-1605559424843-9e4c228bf1c2?w=400&h=300&fit=crop",
      condition: "Excellent" as const
    },
    {
      id: "car-2",
      make: "Hyundai",
      model: "i20",
      year: 2019,
      price: 480000,
      mileage: 52000,
      fuelType: "Diesel",
      location: "Delhi, NCR",
      image: "https://images.unsplash.com/photo-1549399736-bf80deef1d17?w=400&h=300&fit=crop",
      condition: "Good" as const
    },
    {
      id: "car-3",
      make: "Tata",
      model: "Nexon",
      year: 2021,
      price: 850000,
      mileage: 28000,
      fuelType: "Electric",
      location: "Bangalore, Karnataka",
      image: "https://images.unsplash.com/photo-1572927651086-5f4bc5bd3ca6?w=400&h=300&fit=crop",
      condition: "Excellent" as const
    },
    {
      id: "car-4",
      make: "Honda",
      model: "City",
      year: 2018,
      price: 720000,
      mileage: 65000,
      fuelType: "Petrol",
      location: "Pune, Maharashtra",
      image: "https://images.unsplash.com/photo-1553440569-bcc63803a83d?w=400&h=300&fit=crop",
      condition: "Good" as const
    }
  ];

  const auctionCars = [
    {
      id: "auction-1",
      make: "Mahindra",
      model: "XUV500",
      year: 2017,
      price: 350000,
      currentBid: 320000,
      mileage: 78000,
      fuelType: "Diesel",
      location: "Chennai, Tamil Nadu",
      image: "https://images.unsplash.com/photo-1593941707882-a5bac6861d75?w=400&h=300&fit=crop",
      condition: "Fair" as const,
      isAuction: true,
      auctionEndTime: "2 days"
    },
    {
      id: "auction-2",
      make: "Ford",
      model: "EcoSport",
      year: 2019,
      price: 450000,
      currentBid: 415000,
      mileage: 42000,
      fuelType: "Petrol",
      location: "Kolkata, West Bengal",
      image: "https://images.unsplash.com/photo-1605559424843-9e4c228bf1c2?w=400&h=300&fit=crop",
      condition: "Good" as const,
      isAuction: true,
      auctionEndTime: "5 hours"
    }
  ];

  const brands = [
    { value: "all", label: "All Brands" },
    { value: "maruti", label: "Maruti Suzuki" },
    { value: "hyundai", label: "Hyundai" },
    { value: "tata", label: "Tata" },
    { value: "honda", label: "Honda" },
    { value: "mahindra", label: "Mahindra" },
    { value: "ford", label: "Ford" }
  ];

  const priceRanges = [
    { value: "all", label: "All Prices" },
    { value: "under-5", label: "Under ₹5 Lakh" },
    { value: "5-10", label: "₹5-10 Lakh" },
    { value: "10-15", label: "₹10-15 Lakh" },
    { value: "above-15", label: "Above ₹15 Lakh" }
  ];

  const fuelTypes = [
    { value: "all", label: "All Fuel Types" },
    { value: "petrol", label: "Petrol" },
    { value: "diesel", label: "Diesel" },
    { value: "electric", label: "Electric" },
    { value: "hybrid", label: "Hybrid" }
  ];

  const filterCars = (cars: typeof carsForSale) => {
    return cars.filter(car => {
      const matchesSearch = 
        car.make.toLowerCase().includes(searchTerm.toLowerCase()) ||
        car.model.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesBrand = selectedBrand === "all" || 
        car.make.toLowerCase().includes(selectedBrand);
      
      const matchesFuel = fuelType === "all" || 
        car.fuelType.toLowerCase() === fuelType;
      
      const matchesPrice = priceRange === "all" ||
        (priceRange === "under-5" && car.price < 500000) ||
        (priceRange === "5-10" && car.price >= 500000 && car.price < 1000000) ||
        (priceRange === "10-15" && car.price >= 1000000 && car.price < 1500000) ||
        (priceRange === "above-15" && car.price >= 1500000);

      return matchesSearch && matchesBrand && matchesFuel && matchesPrice;
    });
  };

  const filteredCarsForSale = filterCars(carsForSale);
  const filteredAuctionCars = filterCars(auctionCars as any);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <section className="py-16 bg-muted/50">
        <div className="container mx-auto px-4">
          <div className="text-center">
            <h1 className="text-4xl font-bold mb-4">Cars for Sale</h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Browse our collection of quality pre-owned vehicles. All cars are inspected 
              and come with detailed service history.
            </p>
          </div>
        </div>
      </section>

      {/* Filters */}
      <section className="py-8 border-b">
        <div className="container mx-auto px-4">
          <div className="flex flex-col lg:flex-row gap-4 items-center">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder="Search cars..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
                data-testid="input-search-cars"
              />
            </div>
            
            <div className="flex gap-4">
              <Select value={selectedBrand} onValueChange={setSelectedBrand}>
                <SelectTrigger className="w-40" data-testid="select-brand">
                  <SelectValue placeholder="Brand" />
                </SelectTrigger>
                <SelectContent>
                  {brands.map(brand => (
                    <SelectItem key={brand.value} value={brand.value}>
                      {brand.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={priceRange} onValueChange={setPriceRange}>
                <SelectTrigger className="w-40" data-testid="select-price">
                  <SelectValue placeholder="Price" />
                </SelectTrigger>
                <SelectContent>
                  {priceRanges.map(range => (
                    <SelectItem key={range.value} value={range.value}>
                      {range.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={fuelType} onValueChange={setFuelType}>
                <SelectTrigger className="w-40" data-testid="select-fuel">
                  <SelectValue placeholder="Fuel Type" />
                </SelectTrigger>
                <SelectContent>
                  {fuelTypes.map(fuel => (
                    <SelectItem key={fuel.value} value={fuel.value}>
                      {fuel.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Active Filters */}
          <div className="flex gap-2 mt-4">
            {selectedBrand !== "all" && (
              <Badge variant="secondary" className="cursor-pointer" onClick={() => setSelectedBrand("all")}>
                {brands.find(b => b.value === selectedBrand)?.label} ×
              </Badge>
            )}
            {priceRange !== "all" && (
              <Badge variant="secondary" className="cursor-pointer" onClick={() => setPriceRange("all")}>
                {priceRanges.find(p => p.value === priceRange)?.label} ×
              </Badge>
            )}
            {fuelType !== "all" && (
              <Badge variant="secondary" className="cursor-pointer" onClick={() => setFuelType("all")}>
                {fuelTypes.find(f => f.value === fuelType)?.label} ×
              </Badge>
            )}
            {searchTerm && (
              <Badge variant="secondary" className="cursor-pointer" onClick={() => setSearchTerm("")}>
                "{searchTerm}" ×
              </Badge>
            )}
          </div>
        </div>
      </section>

      {/* Cars Tabs */}
      <section className="py-12">
        <div className="container mx-auto px-4">
          <Tabs defaultValue="for-sale" className="w-full">
            <TabsList className="grid w-full grid-cols-2 max-w-md mx-auto mb-8">
              <TabsTrigger value="for-sale" data-testid="tab-for-sale">
                For Sale ({filteredCarsForSale.length})
              </TabsTrigger>
              <TabsTrigger value="auction" data-testid="tab-auction">
                Auction ({filteredAuctionCars.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="for-sale">
              {filteredCarsForSale.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {filteredCarsForSale.map((car) => (
                    <CarCard key={car.id} {...car} />
                  ))}
                </div>
              ) : (
                <div className="text-center py-16">
                  <SlidersHorizontal className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-xl font-semibold mb-2">No cars found</h3>
                  <p className="text-muted-foreground mb-6">
                    Try adjusting your search criteria
                  </p>
                  <Button 
                    onClick={() => {
                      setSearchTerm("");
                      setSelectedBrand("all");
                      setPriceRange("all");
                      setFuelType("all");
                    }}
                    data-testid="button-clear-filters-sale"
                  >
                    Clear All Filters
                  </Button>
                </div>
              )}
            </TabsContent>

            <TabsContent value="auction">
              {filteredAuctionCars.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {filteredAuctionCars.map((car) => (
                    <CarCard key={car.id} {...car} />
                  ))}
                </div>
              ) : (
                <div className="text-center py-16">
                  <SlidersHorizontal className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-xl font-semibold mb-2">No auction cars found</h3>
                  <p className="text-muted-foreground mb-6">
                    Try adjusting your search criteria or check back later for new auctions
                  </p>
                  <Button 
                    onClick={() => {
                      setSearchTerm("");
                      setSelectedBrand("all");
                      setPriceRange("all");
                      setFuelType("all");
                    }}
                    data-testid="button-clear-filters-auction"
                  >
                    Clear All Filters
                  </Button>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </section>

      {/* Sell Your Car CTA */}
      <section className="py-16 bg-muted/50">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold mb-4">Want to Sell Your Car?</h2>
          <p className="text-lg text-muted-foreground mb-8">
            List your car with us and reach thousands of potential buyers
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" data-testid="button-sell-car">
              List Your Car
            </Button>
            <Button size="lg" variant="outline" data-testid="button-auction-car">
              Start an Auction
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}