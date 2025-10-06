import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Slider } from "@/components/ui/slider";
import { Search, SlidersHorizontal, Loader2, ArrowUp, ArrowDown, ChevronDown, X } from "lucide-react";
import type { Car } from "@shared/schema";

export default function Cars() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedBrand, setSelectedBrand] = useState("all");
  const [priceRange, setPriceRange] = useState("all");
  const [fuelType, setFuelType] = useState("all");
  
  const [sortBy, setSortBy] = useState<string>("price");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [transmission, setTransmission] = useState("all");
  const [bodyType, setBodyType] = useState("all");
  const [color, setColor] = useState("all");
  const [yearMin, setYearMin] = useState("");
  const [yearMax, setYearMax] = useState("");
  const [mileageMin, setMileageMin] = useState("");
  const [mileageMax, setMileageMax] = useState("");

  const buildQueryString = () => {
    const params = new URLSearchParams();
    
    if (sortBy && sortBy !== "none") params.append("sortBy", sortBy);
    if (sortOrder) params.append("sortOrder", sortOrder);
    if (transmission !== "all") params.append("transmission", transmission);
    if (bodyType !== "all") params.append("bodyType", bodyType);
    if (color !== "all") params.append("color", color);
    if (yearMin) params.append("yearMin", yearMin);
    if (yearMax) params.append("yearMax", yearMax);
    if (mileageMin) params.append("mileageMin", mileageMin);
    if (mileageMax) params.append("mileageMax", mileageMax);
    
    const queryString = params.toString();
    return queryString ? `?${queryString}` : "";
  };

  const { data: allCars, isLoading, isError, error, refetch } = useQuery<Car[]>({
    queryKey: [
      "/api/cars",
      sortBy,
      sortOrder,
      transmission,
      bodyType,
      color,
      yearMin,
      yearMax,
      mileageMin,
      mileageMax,
    ],
    queryFn: async () => {
      const queryString = buildQueryString();
      const response = await fetch(`/api/cars${queryString}`);
      if (!response.ok) {
        throw new Error("Failed to fetch cars");
      }
      return response.json();
    },
    staleTime: 5 * 60 * 1000,
    retry: 3,
  });

  const carsForSale = allCars?.filter(car => !car.isAuction) || [];
  const auctionCars = allCars?.filter(car => car.isAuction) || [];

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

  const sortFields = [
    { value: "price", label: "Price" },
    { value: "year", label: "Year" },
    { value: "mileage", label: "Mileage" }
  ];

  const transmissions = [
    { value: "all", label: "All Transmissions" },
    { value: "Manual", label: "Manual" },
    { value: "Automatic", label: "Automatic" },
    { value: "CVT", label: "CVT" }
  ];

  const bodyTypes = [
    { value: "all", label: "All Body Types" },
    { value: "Sedan", label: "Sedan" },
    { value: "SUV", label: "SUV" },
    { value: "Hatchback", label: "Hatchback" },
    { value: "Coupe", label: "Coupe" },
    { value: "Wagon", label: "Wagon" }
  ];

  const colors = [
    { value: "all", label: "All Colors" },
    { value: "White", label: "White" },
    { value: "Black", label: "Black" },
    { value: "Silver", label: "Silver" },
    { value: "Gray", label: "Gray" },
    { value: "Red", label: "Red" },
    { value: "Blue", label: "Blue" },
    { value: "Green", label: "Green" },
    { value: "Brown", label: "Brown" }
  ];

  const filterCars = (cars: Car[]) => {
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
  const filteredAuctionCars = filterCars(auctionCars);

  const clearAllFilters = () => {
    setSearchTerm("");
    setSelectedBrand("all");
    setPriceRange("all");
    setFuelType("all");
    setSortBy("price");
    setSortOrder("asc");
    setTransmission("all");
    setBodyType("all");
    setColor("all");
    setYearMin("");
    setYearMax("");
    setMileageMin("");
    setMileageMax("");
  };

  const hasActiveFilters = () => {
    return (
      searchTerm !== "" ||
      selectedBrand !== "all" ||
      priceRange !== "all" ||
      fuelType !== "all" ||
      transmission !== "all" ||
      bodyType !== "all" ||
      color !== "all" ||
      yearMin !== "" ||
      yearMax !== "" ||
      mileageMin !== "" ||
      mileageMax !== "" ||
      sortBy !== "price" ||
      sortOrder !== "asc"
    );
  };

  const toggleSortOrder = () => {
    setSortOrder(prev => prev === "asc" ? "desc" : "asc");
  };

  return (
    <div className="min-h-screen bg-background">
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

      <section className="py-8 border-b">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
            <div className="relative w-full">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder="Search cars..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 min-h-11 w-full"
                data-testid="input-search-cars"
              />
            </div>
            
            <div className="w-full">
              <Select value={selectedBrand} onValueChange={setSelectedBrand}>
                <SelectTrigger className="min-h-11 w-full" data-testid="select-brand">
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
            </div>

            <div className="w-full">
              <Select value={priceRange} onValueChange={setPriceRange}>
                <SelectTrigger className="min-h-11 w-full" data-testid="select-price">
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
            </div>

            <div className="w-full">
              <Select value={fuelType} onValueChange={setFuelType}>
                <SelectTrigger className="min-h-11 w-full" data-testid="select-fuel">
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

          <div className="mt-6 space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-muted-foreground">Sort by:</span>
                <Select value={sortBy} onValueChange={setSortBy}>
                  <SelectTrigger className="w-[140px]" data-testid="select-sort-by">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {sortFields.map(field => (
                      <SelectItem key={field.value} value={field.value}>
                        {field.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={toggleSortOrder}
                  data-testid="button-sort-order"
                  className="h-10 w-10"
                >
                  {sortOrder === "asc" ? (
                    <ArrowUp className="h-4 w-4" />
                  ) : (
                    <ArrowDown className="h-4 w-4" />
                  )}
                </Button>
              </div>

              <Button
                variant="outline"
                onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                data-testid="button-toggle-filters"
                className="ml-auto"
              >
                <SlidersHorizontal className="h-4 w-4 mr-2" />
                {showAdvancedFilters ? "Hide" : "Show"} Advanced Filters
                <ChevronDown className={`h-4 w-4 ml-2 transition-transform ${showAdvancedFilters ? "rotate-180" : ""}`} />
              </Button>

              {hasActiveFilters() && (
                <Button
                  variant="ghost"
                  onClick={clearAllFilters}
                  data-testid="button-clear-all"
                  className="text-destructive hover:text-destructive"
                >
                  <X className="h-4 w-4 mr-2" />
                  Clear All
                </Button>
              )}
            </div>

            <Collapsible open={showAdvancedFilters}>
              <CollapsibleContent className="space-y-4">
                <div className="p-4 border rounded-lg bg-muted/30">
                  <h3 className="text-sm font-semibold mb-4">Advanced Filters</h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div>
                      <label className="text-xs font-medium mb-2 block">Transmission</label>
                      <Select value={transmission} onValueChange={setTransmission}>
                        <SelectTrigger data-testid="select-transmission">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {transmissions.map(t => (
                            <SelectItem key={t.value} value={t.value}>
                              {t.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <label className="text-xs font-medium mb-2 block">Body Type</label>
                      <Select value={bodyType} onValueChange={setBodyType}>
                        <SelectTrigger data-testid="select-body-type">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {bodyTypes.map(b => (
                            <SelectItem key={b.value} value={b.value}>
                              {b.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <label className="text-xs font-medium mb-2 block">Color</label>
                      <Select value={color} onValueChange={setColor}>
                        <SelectTrigger data-testid="select-color">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {colors.map(c => (
                            <SelectItem key={c.value} value={c.value}>
                              {c.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <label className="text-xs font-medium mb-2 block">Year Range</label>
                      <div className="flex gap-2">
                        <Input
                          type="number"
                          placeholder="Min"
                          value={yearMin}
                          onChange={(e) => setYearMin(e.target.value)}
                          data-testid="input-year-min"
                          min="1990"
                          max="2025"
                        />
                        <Input
                          type="number"
                          placeholder="Max"
                          value={yearMax}
                          onChange={(e) => setYearMax(e.target.value)}
                          data-testid="input-year-max"
                          min="1990"
                          max="2025"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-xs font-medium mb-2 block">Mileage Range (km)</label>
                      <div className="flex gap-2">
                        <Input
                          type="number"
                          placeholder="Min"
                          value={mileageMin}
                          onChange={(e) => setMileageMin(e.target.value)}
                          data-testid="input-mileage-min"
                          min="0"
                        />
                        <Input
                          type="number"
                          placeholder="Max"
                          value={mileageMax}
                          onChange={(e) => setMileageMax(e.target.value)}
                          data-testid="input-mileage-max"
                          min="0"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>

          <div className="flex flex-wrap gap-2 mt-4">
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
            {(sortBy !== "price" || sortOrder !== "asc") && (
              <Badge variant="secondary" className="cursor-pointer" onClick={() => { setSortBy("price"); setSortOrder("asc"); }}>
                Sort: {sortFields.find(s => s.value === sortBy)?.label} ({sortOrder === "asc" ? "Low to High" : "High to Low"}) ×
              </Badge>
            )}
            {transmission !== "all" && (
              <Badge variant="secondary" className="cursor-pointer" onClick={() => setTransmission("all")}>
                {transmissions.find(t => t.value === transmission)?.label} ×
              </Badge>
            )}
            {bodyType !== "all" && (
              <Badge variant="secondary" className="cursor-pointer" onClick={() => setBodyType("all")}>
                {bodyTypes.find(b => b.value === bodyType)?.label} ×
              </Badge>
            )}
            {color !== "all" && (
              <Badge variant="secondary" className="cursor-pointer" onClick={() => setColor("all")}>
                {colors.find(c => c.value === color)?.label} ×
              </Badge>
            )}
            {yearMin && (
              <Badge variant="secondary" className="cursor-pointer" onClick={() => setYearMin("")}>
                Year Min: {yearMin} ×
              </Badge>
            )}
            {yearMax && (
              <Badge variant="secondary" className="cursor-pointer" onClick={() => setYearMax("")}>
                Year Max: {yearMax} ×
              </Badge>
            )}
            {mileageMin && (
              <Badge variant="secondary" className="cursor-pointer" onClick={() => setMileageMin("")}>
                Mileage Min: {mileageMin} km ×
              </Badge>
            )}
            {mileageMax && (
              <Badge variant="secondary" className="cursor-pointer" onClick={() => setMileageMax("")}>
                Mileage Max: {mileageMax} km ×
              </Badge>
            )}
          </div>
        </div>
      </section>

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
              {isLoading ? (
                <div className="flex justify-center py-16">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : isError ? (
                <div className="text-center py-16">
                  <h3 className="text-xl font-semibold mb-2">Failed to load cars</h3>
                  <p className="text-muted-foreground mb-6">
                    {error?.message || "Something went wrong. Please try again."}
                  </p>
                  <Button onClick={() => refetch()} data-testid="button-retry-cars">
                    Try Again
                  </Button>
                </div>
              ) : filteredCarsForSale.length > 0 ? (
                <div className="grid sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredCarsForSale.map((car) => (
                    <CarCard 
                      key={car.id} 
                      id={car.id}
                      make={car.make}
                      model={car.model}
                      year={car.year}
                      price={car.price}
                      mileage={car.mileage}
                      fuelType={car.fuelType}
                      location={car.location}
                      image={car.image}
                      condition={car.condition as "Excellent" | "Good" | "Fair"}
                      isAuction={false}
                      description={car.description || undefined}
                      transmission={car.transmission || undefined}
                      bodyType={car.bodyType || undefined}
                      color={car.color || undefined}
                      numOwners={car.numOwners || undefined}
                      engineSize={car.engineSize || undefined}
                    />
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
                    onClick={clearAllFilters}
                    data-testid="button-clear-filters-sale"
                  >
                    Clear All Filters
                  </Button>
                </div>
              )}
            </TabsContent>

            <TabsContent value="auction">
              {isLoading ? (
                <div className="flex justify-center py-16">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : isError ? (
                <div className="text-center py-16">
                  <h3 className="text-xl font-semibold mb-2">Failed to load auction cars</h3>
                  <p className="text-muted-foreground mb-6">
                    {error?.message || "Something went wrong. Please try again."}
                  </p>
                  <Button onClick={() => refetch()} data-testid="button-retry-auctions">
                    Try Again
                  </Button>
                </div>
              ) : filteredAuctionCars.length > 0 ? (
                <div className="grid sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredAuctionCars.map((car) => {
                    const formatAuctionEndTime = (endTime: string | Date | null) => {
                      if (!endTime) return "Soon";
                      const date = new Date(endTime);
                      const now = new Date();
                      const diffMs = date.getTime() - now.getTime();
                      const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
                      if (diffDays > 0) return `${diffDays} days`;
                      const diffHours = Math.ceil(diffMs / (1000 * 60 * 60));
                      return diffHours > 0 ? `${diffHours} hours` : "Soon";
                    };
                    
                    return (
                      <CarCard 
                        key={car.id}
                        id={car.id}
                        make={car.make}
                        model={car.model}
                        year={car.year}
                        price={car.price}
                        mileage={car.mileage}
                        fuelType={car.fuelType}
                        location={car.location}
                        image={car.image}
                        condition={car.condition as "Excellent" | "Good" | "Fair"}
                        isAuction={true}
                        currentBid={car.currentBid || undefined}
                        auctionEndTime={formatAuctionEndTime(car.auctionEndTime)}
                        description={car.description || undefined}
                        transmission={car.transmission || undefined}
                        bodyType={car.bodyType || undefined}
                        color={car.color || undefined}
                        numOwners={car.numOwners || undefined}
                        engineSize={car.engineSize || undefined}
                      />
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-16">
                  <SlidersHorizontal className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-xl font-semibold mb-2">No auction cars found</h3>
                  <p className="text-muted-foreground mb-6">
                    Try adjusting your search criteria or check back later for new auctions
                  </p>
                  <Button 
                    onClick={clearAllFilters}
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

      <section className="py-16 bg-muted/50">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold mb-4">Want to Sell Your Car?</h2>
          <p className="text-lg text-muted-foreground mb-8">
            List your car with us and reach thousands of potential buyers
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" data-testid="button-sell-car" asChild>
              <Link href="/contact">
                List Your Car
              </Link>
            </Button>
            <Button size="lg" variant="outline" data-testid="button-auction-car" asChild>
              <Link href="/contact">
                Start an Auction
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
