import { CarCard } from '../CarCard';

export default function CarCardExample() {
  return (
    <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      <CarCard
        id="car-1"
        make="Maruti Suzuki"
        model="Swift"
        year={2020}
        price={550000}
        mileage={45000}
        fuelType="Petrol"
        location="Mumbai, Maharashtra"
        image="https://images.unsplash.com/photo-1605559424843-9e4c228bf1c2?w=400&h=300&fit=crop"
        condition="Excellent"
      />
      <CarCard
        id="car-2"
        make="Hyundai"
        model="Creta"
        year={2019}
        price={120000}
        currentBid={115000}
        mileage={72000}
        fuelType="Diesel"
        location="Delhi, NCR"
        image="https://images.unsplash.com/photo-1549399736-bf80deef1d17?w=400&h=300&fit=crop"
        condition="Good"
        isAuction={true}
        auctionEndTime="2 days"
      />
      <CarCard
        id="car-3"
        make="Tata"
        model="Nexon"
        year={2021}
        price={850000}
        mileage={28000}
        fuelType="Electric"
        location="Bangalore, Karnataka"
        image="https://images.unsplash.com/photo-1572927651086-5f4bc5bd3ca6?w=400&h=300&fit=crop"
        condition="Excellent"
      />
    </div>
  );
}