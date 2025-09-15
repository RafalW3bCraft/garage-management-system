import { AppointmentCard } from '../AppointmentCard';

export default function AppointmentCardExample() {
  return (
    <div className="p-4 space-y-4">
      <AppointmentCard
        id="apt-1"
        serviceType="Oil Change Service"
        carDetails="Maruti Swift 2020 (MH-01-AB-1234)"
        dateTime="Dec 20, 2024 at 10:00 AM"
        status="confirmed"
        mechanicName="Rajesh Kumar"
        estimatedDuration="30 minutes"
        location="RonakMotorGarage, Mumbai"
        price={2500}
      />
      <AppointmentCard
        id="apt-2"
        serviceType="Complete Vehicle Service"
        carDetails="Hyundai Creta 2019 (DL-08-CD-5678)"
        dateTime="Dec 22, 2024 at 2:00 PM"
        status="pending"
        mechanicName="Suresh Sharma"
        estimatedDuration="3 hours"
        location="RonakMotorGarage, Delhi"
        price={8500}
      />
      <AppointmentCard
        id="apt-3"
        serviceType="AC Service"
        carDetails="Tata Nexon 2021 (KA-03-EF-9012)"
        dateTime="Dec 18, 2024 at 11:30 AM"
        status="completed"
        mechanicName="Anil Patel"
        estimatedDuration="1 hour"
        location="RonakMotorGarage, Bangalore"
        price={3500}
      />
    </div>
  );
}