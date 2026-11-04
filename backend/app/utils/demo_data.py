"""
Demo data generator with realistic patterns and anomalies
"""
import random
from datetime import datetime, timedelta, date
from sqlalchemy.orm import Session
from ..models import (
    Store, SKU, InventorySnapshot, SalesDaily, ReceiptsDaily,
    Transfer, CycleCount, Supplier, SKUSupplier, AnomalyEvent,
    TransferRecommendation, StoreDistance, SalesHourly, Telemetry, SimulationScenario
)
from ..database import SessionLocal, engine, Base
import math


def calculate_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate distance between two points using Haversine formula"""
    R = 6371  # Earth's radius in km
    
    lat1_rad = math.radians(lat1)
    lat2_rad = math.radians(lat2)
    delta_lat = math.radians(lat2 - lat1)
    delta_lon = math.radians(lon2 - lon1)
    
    a = math.sin(delta_lat/2)**2 + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(delta_lon/2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
    
    return R * c


def generate_demo_data(
    num_stores: int = 5,
    num_skus: int = 200,
    days_history: int = 60
):
    """
    Generate comprehensive demo data with realistic patterns
    """
    print("🚀 Starting demo data generation...")
    
    # Create tables
    Base.metadata.create_all(bind=engine)
    
    db = SessionLocal()
    
    try:
        # Clear existing data
        print("🗑️  Clearing existing data...")
        db.query(SimulationScenario).delete()
        db.query(TransferRecommendation).delete()
        db.query(AnomalyEvent).delete()
        db.query(CycleCount).delete()
        db.query(Transfer).delete()
        db.query(ReceiptsDaily).delete()
        db.query(SalesDaily).delete()
        db.query(SalesHourly).delete()
        db.query(Telemetry).delete()
        db.query(InventorySnapshot).delete()
        db.query(SKUSupplier).delete()
        db.query(Supplier).delete()
        db.query(SKU).delete()
        db.query(StoreDistance).delete()
        db.query(Store).delete()
        db.commit()
        
        # 1. Create Stores (Chipotle Athens, GA Locations)
        print(f"🏪 Creating {num_stores} Chipotle Athens locations...")
        store_data = [
            {"name": "Chipotle Athens Downtown", "location": "Downtown Athens, GA", "latitude": 33.9519, "longitude": -83.3576},
            {"name": "Chipotle Athens Eastside", "location": "Eastside Athens, GA", "latitude": 33.9500, "longitude": -83.3400},
            {"name": "Chipotle Athens West", "location": "West Athens, GA", "latitude": 33.9450, "longitude": -83.3900},
            {"name": "Chipotle Athens North", "location": "North Athens, GA", "latitude": 33.9650, "longitude": -83.3550},
            {"name": "Chipotle Athens South", "location": "South Athens, GA", "latitude": 33.9350, "longitude": -83.3600},
        ]
        
        stores = []
        for i in range(min(num_stores, len(store_data))):
            store = Store(**store_data[i])
            db.add(store)
            stores.append(store)
        db.commit()
        
        # Calculate store distances (Athens Chipotle locations - actual distances)
        print("📏 Setting store distances...")
        # Distance matrix in miles (converted to km)
        distance_matrix = {
            (1, 2): 2.12,  # Downtown to Eastside
            (1, 3): 3.38,  # Downtown to West
            (1, 4): 1.28,  # Downtown to North
            (1, 5): 1.64,  # Downtown to South
            (2, 3): 5.09,  # Eastside to West
            (2, 4): 1.99,  # Eastside to North
            (2, 5): 2.24,  # Eastside to South
            (3, 4): 4.59,  # West to North
            (3, 5): 3.0,   # West to South
            (4, 5): 2.73,  # North to South
        }
        
        for (from_id, to_id), miles in distance_matrix.items():
            # Convert miles to km
            distance_km = miles * 1.60934
            # Transfer cost: $0.50 per mile
            cost = miles * 0.50
            
            # Add both directions
            store_dist = StoreDistance(
                from_store_id=from_id,
                to_store_id=to_id,
                distance_km=round(distance_km, 2),
                transfer_cost=round(cost, 2)
            )
            db.add(store_dist)
            
            # Reverse direction
            store_dist_reverse = StoreDistance(
                from_store_id=to_id,
                to_store_id=from_id,
                distance_km=round(distance_km, 2),
                transfer_cost=round(cost, 2)
            )
            db.add(store_dist_reverse)
        
        db.commit()
        
        # 2. Create SKUs (Chipotle Ingredients & Supplies)
        print(f"📦 Creating {num_skus} Chipotle SKUs...")
        categories = {
            "Proteins": 30,
            "Produce": 40,
            "Dairy": 25,
            "Grains & Tortillas": 25,
            "Salsas & Sauces": 20,
            "Beverages": 25,
            "Packaging": 20,
            "Supplies": 15
        }
        
        sku_names = {
            "Proteins": ["Chicken Breast (Raw)", "Steak (Carne Asada)", "Carnitas Pork", "Barbacoa Beef", "Sofritas (Tofu)"],
            "Produce": ["Romaine Lettuce", "Cilantro (Fresh)", "White Onions", "Red Onions", "Jalapeños", "Bell Peppers (Green)", "Bell Peppers (Red)", "Limes", "Avocados (Hass)", "Tomatoes (Roma)"],
            "Dairy": ["Sour Cream", "Shredded Cheese (Monterey Jack)", "Shredded Cheese (Cheddar)", "Queso Blanco", "Milk (Whole)"],
            "Grains & Tortillas": ["White Rice (Bulk)", "Brown Rice (Bulk)", "Black Beans (Canned)", "Pinto Beans (Canned)", "Flour Tortillas (Burrito)", "Corn Tortillas (Tacos)", "Tortilla Chips"],
            "Salsas & Sauces": ["Mild Tomato Salsa", "Medium Tomatillo Salsa", "Hot Tomatillo Salsa", "Corn Salsa", "Chipotle Honey Vinaigrette", "Guacamole (Prepared)"],
            "Beverages": ["Coca-Cola Syrup", "Sprite Syrup", "Iced Tea (Unsweetened)", "Lemonade Mix", "Agua Fresca Mix", "Cups (32oz)", "Cups (21oz)", "Lids (Large)", "Straws"],
            "Packaging": ["Burrito Foil Wrap", "Bowl Containers", "Salad Containers", "Bag (To-Go)", "Napkins", "Forks", "Spoons", "Knives"],
            "Supplies": ["Gloves (Nitrile)", "Cleaning Solution", "Paper Towels", "Trash Bags", "Sanitizer Wipes"]
        }
        
        skus = []
        sku_count = 0
        used_names = set()  # Track used names to avoid duplicates
        
        for category, count in categories.items():
            base_names = sku_names.get(category, ["Product"])
            for i in range(count):
                if sku_count >= num_skus:
                    break
                    
                # Generate UNIQUE Chipotle SKU names
                base_name = random.choice(base_names)
                
                # Make name unique by adding variant number if needed
                name = base_name
                variant = 1
                while name in used_names:
                    variant += 1
                    name = f"{base_name} #{variant}"
                
                used_names.add(name)
                
                # Realistic costs for restaurant ingredients
                cost_ranges = {
                    "Proteins": (8.0, 25.0),
                    "Produce": (2.0, 15.0),
                    "Dairy": (3.0, 12.0),
                    "Grains & Tortillas": (1.5, 8.0),
                    "Salsas & Sauces": (2.0, 10.0),
                    "Beverages": (0.5, 5.0),
                    "Packaging": (0.1, 2.0),
                    "Supplies": (0.5, 3.0)
                }
                
                cost_range = cost_ranges.get(category, (1.0, 10.0))
                cost = round(random.uniform(*cost_range), 2)
                price = round(cost * random.uniform(1.5, 3.0), 2)  # Restaurant markup
                
                # Perishable items for Chipotle
                is_perishable = category in ["Proteins", "Produce", "Dairy", "Salsas & Sauces"]
                
                sku = SKU(
                    name=name,
                    category=category,
                    unit="each",
                    cost=cost,
                    price=price,
                    is_perishable=is_perishable
                )
                db.add(sku)
                skus.append(sku)
                sku_count += 1
        
        db.commit()
        print(f"✅ Created {len(skus)} SKUs")
        
        # 3. Create Suppliers (Chipotle Suppliers)
        print("🚚 Creating suppliers...")
        suppliers = []
        supplier_names = ["Sysco Foodservice", "US Foods", "Local Farms Co-op", "Coca-Cola Foodservice", "Produce Distributors Inc"]
        for name in supplier_names:
            supplier = Supplier(
                name=name,
                avg_lead_time_days=random.randint(2, 7),
                lead_time_std_days=random.randint(1, 3)
            )
            db.add(supplier)
            suppliers.append(supplier)
        db.commit()
        
        # Link SKUs to suppliers
        for sku in skus:
            supplier = random.choice(suppliers)
            sku_supp = SKUSupplier(
                sku_id=sku.id,
                supplier_id=supplier.id,
                case_pack=random.choice([6, 12, 24, 48]),
                min_order_qty=random.choice([1, 2, 5, 10])
            )
            db.add(sku_supp)
        db.commit()
        
        # 4. Generate historical data
        print(f"📊 Generating {days_history} days of sales history...")
        
        start_date = datetime.now().date() - timedelta(days=days_history)
        
        # Track inventory for each store/sku
        inventory_tracker = {}
        
        for store in stores:
            for sku in skus:
                # Initialize inventory (higher = fewer critical stockouts in demo)
                initial_inventory = random.randint(45, 130)
                inventory_tracker[(store.id, sku.id)] = initial_inventory
                
                # Base demand varies by category and store
                base_demand = {
                    "Beverages": random.uniform(5, 15),
                    "Snacks": random.uniform(4, 12),
                    "Dairy": random.uniform(3, 10),
                    "Produce": random.uniform(2, 8),
                    "Frozen": random.uniform(2, 6),
                    "Bakery": random.uniform(3, 9),
                    "Meat": random.uniform(2, 7),
                    "Household": random.uniform(1, 5)
                }.get(sku.category, 3)
                
                # Store multiplier (some stores are busier)
                store_multiplier = 1.0 + (store.id % 3) * 0.2
                base_demand *= store_multiplier
                
                for day_offset in range(days_history):
                    current_date = start_date + timedelta(days=day_offset)
                    
                    # Weekday vs weekend pattern
                    is_weekend = current_date.weekday() >= 5
                    weekend_multiplier = 1.3 if is_weekend else 1.0
                    
                    # Calculate sales with noise
                    daily_sales = int(base_demand * weekend_multiplier * random.uniform(0.7, 1.3))
                    daily_sales = max(0, min(daily_sales, inventory_tracker[(store.id, sku.id)]))
                    
                    # Record sales
                    if daily_sales > 0:
                        sales = SalesDaily(
                            store_id=store.id,
                            sku_id=sku.id,
                            ts_date=current_date,
                            qty_sold=daily_sales
                        )
                        db.add(sales)
                    
                    # Update inventory
                    inventory_tracker[(store.id, sku.id)] -= daily_sales
                    
                    # Receive shipments periodically (more = fewer critical)
                    receipts = 0
                    if random.random() < 0.20:  # 20% chance of receipt
                        receipts = int(base_demand * random.uniform(6, 12))
                        receipt = ReceiptsDaily(
                            store_id=store.id,
                            sku_id=sku.id,
                            ts_date=current_date,
                            qty_received=receipts
                        )
                        db.add(receipt)
                        inventory_tracker[(store.id, sku.id)] += receipts
                    
                    # Record inventory snapshot
                    snapshot = InventorySnapshot(
                        store_id=store.id,
                        sku_id=sku.id,
                        ts_date=current_date,
                        on_hand=max(0, inventory_tracker[(store.id, sku.id)])
                    )
                    db.add(snapshot)
        
        db.commit()
        print("✅ Sales history generated")
        
        # 5. Inject anomalies
        print("⚠️  Injecting anomalies...")
        anomaly_count = 0
        
        # Select random store/sku combinations for anomalies (fewer = less critical noise)
        anomaly_targets = random.sample(
            [(s.id, sk.id) for s in stores for sk in random.sample(skus, 10)],
            min(8, len(stores) * 6)
        )
        
        for store_id, sku_id in anomaly_targets:
            # Pick a random recent date
            anomaly_date = start_date + timedelta(days=random.randint(days_history - 30, days_history - 1))
            
            # Get the inventory snapshot
            snapshot = db.query(InventorySnapshot).filter(
                InventorySnapshot.store_id == store_id,
                InventorySnapshot.sku_id == sku_id,
                InventorySnapshot.ts_date == anomaly_date
            ).first()
            
            if snapshot:
                # Create unexplained drop (smaller range = fewer critical)
                residual = -random.randint(3, 12)
                severity = "critical" if residual < -10 else "high" if residual < -7 else "medium"
                
                explanation = f"Unexplained inventory drop of {abs(residual)} units. Possible shrink or unrecorded transaction."
                
                anomaly = AnomalyEvent(
                    store_id=store_id,
                    sku_id=sku_id,
                    ts_date=anomaly_date,
                    residual=residual,
                    severity=severity,
                    explanation_hint=explanation
                )
                db.add(anomaly)
                anomaly_count += 1
        
        db.commit()
        print(f"✅ Injected {anomaly_count} anomalies")
        
        # 6. Generate cycle counts (more recent = better confidence scores / more A & B grades)
        print("📋 Generating cycle counts...")
        today = datetime.now().date()
        
        for store in stores:
            # 60% of SKUs get a RECENT cycle count (within last 7 days) so scores spread to A/B
            recent_counted = random.sample(skus, int(len(skus) * 0.6))
            for sku in recent_counted:
                count_date = today - timedelta(days=random.randint(1, 7))
                snapshot = db.query(InventorySnapshot).filter(
                    InventorySnapshot.store_id == store.id,
                    InventorySnapshot.sku_id == sku.id,
                    InventorySnapshot.ts_date == count_date
                ).first()
                if not snapshot:
                    snapshot = db.query(InventorySnapshot).filter(
                        InventorySnapshot.store_id == store.id,
                        InventorySnapshot.sku_id == sku.id
                    ).order_by(InventorySnapshot.ts_date.desc()).first()
                if snapshot:
                    counted = snapshot.on_hand + random.randint(-2, 2)
                    counted = max(0, counted)
                    cycle_count = CycleCount(
                        store_id=store.id,
                        sku_id=sku.id,
                        ts_date=count_date,
                        counted_qty=counted
                    )
                    db.add(cycle_count)
            
            # 20% more get an older count (so some items stay C/D)
            other_skus = [s for s in skus if s not in recent_counted]
            older_counted = random.sample(other_skus, min(int(len(skus) * 0.2), len(other_skus))) if other_skus else []
            for sku in older_counted:
                count_date = start_date + timedelta(days=random.randint(days_history - 45, days_history - 1))
                snapshot = db.query(InventorySnapshot).filter(
                    InventorySnapshot.store_id == store.id,
                    InventorySnapshot.sku_id == sku.id,
                    InventorySnapshot.ts_date == count_date
                ).first()
                if not snapshot:
                    snapshot = db.query(InventorySnapshot).filter(
                        InventorySnapshot.store_id == store.id,
                        InventorySnapshot.sku_id == sku.id
                    ).order_by(InventorySnapshot.ts_date.desc()).first()
                if snapshot:
                    counted = snapshot.on_hand + random.randint(-3, 3)
                    counted = max(0, counted)
                    cycle_count = CycleCount(
                        store_id=store.id,
                        sku_id=sku.id,
                        ts_date=count_date,
                        counted_qty=counted
                    )
                    db.add(cycle_count)
        
        db.commit()
        print("✅ Cycle counts generated")
        
        # 7. Create transfer opportunities
        print("🔄 Creating transfer scenarios...")
        # Find SKUs with imbalanced inventory (stricter = fewer recommendations)
        today = datetime.now().date()
        
        for sku in random.sample(skus, min(12, len(skus))):
            store_inventories = []
            for store in stores:
                snapshot = db.query(InventorySnapshot).filter(
                    InventorySnapshot.store_id == store.id,
                    InventorySnapshot.sku_id == sku.id,
                    InventorySnapshot.ts_date == today - timedelta(days=1)
                ).first()
                
                if snapshot:
                    store_inventories.append((store.id, snapshot.on_hand))
            
            if len(store_inventories) >= 2:
                # Sort by inventory level
                store_inventories.sort(key=lambda x: x[1])
                
                # If there's significant imbalance (stricter: 5x ratio = fewer critical)
                if store_inventories[-1][1] > store_inventories[0][1] * 5:
                    from_store_id = store_inventories[-1][0]
                    to_store_id = store_inventories[0][0]
                    qty = min(15, store_inventories[-1][1] // 5)
                    
                    recommendation = TransferRecommendation(
                        from_store_id=from_store_id,
                        to_store_id=to_store_id,
                        sku_id=sku.id,
                        qty=qty,
                        urgency_score=random.uniform(0.5, 0.78),
                        rationale=f"Receiver has low stock ({store_inventories[0][1]} units), donor has excess ({store_inventories[-1][1]} units). Transfer prevents stockout.",
                        status="pending"
                    )
                    db.add(recommendation)
        
        db.commit()
        print("✅ Transfer recommendations created")
        
        # 8. Generate hourly sales data for peak hour forecasting
        print("⏰ Generating hourly sales data for last 14 days...")
        
        # Peak hour multipliers for Chipotle
        hour_multipliers = {
            6: 0.05,   # 6am - Opening prep
            7: 0.1,    # 7am
            8: 0.15,   # 8am
            9: 0.2,    # 9am
            10: 0.4,   # 10am
            11: 1.5,   # 11am - LUNCH RUSH START
            12: 2.2,   # 12pm - PEAK LUNCH
            13: 1.8,   # 1pm - LUNCH RUSH
            14: 0.9,   # 2pm
            15: 0.5,   # 3pm
            16: 0.6,   # 4pm
            17: 1.4,   # 5pm - DINNER RUSH START
            18: 2.0,   # 6pm - PEAK DINNER
            19: 1.7,   # 7pm - DINNER RUSH
            20: 1.1,   # 8pm
            21: 0.6,   # 9pm
            22: 0.2,   # 10pm - Closing
        }
        
        # Generate hourly data for last 14 days only (to keep it manageable)
        hourly_start_date = datetime.now() - timedelta(days=14)
        
        for store in stores:
            # Focus on high-demand items for hourly tracking
            hourly_skus = [s for s in skus if s.category in ["Proteins", "Salsas & Sauces", "Produce"]]
            
            for sku in hourly_skus[:30]:  # Limit to 30 SKUs for performance
                # Base hourly demand
                base_hourly_demand = {
                    "Proteins": random.uniform(2, 8),
                    "Salsas & Sauces": random.uniform(1, 5),
                    "Produce": random.uniform(1, 4)
                }.get(sku.category, 1)
                
                for day_offset in range(14):
                    current_date = hourly_start_date + timedelta(days=day_offset)
                    day_of_week = current_date.weekday()
                    
                    # Weekend multiplier
                    weekend_mult = 1.2 if day_of_week >= 5 else 1.0
                    
                    for hour, multiplier in hour_multipliers.items():
                        # Calculate hourly sales
                        hourly_sales = int(
                            base_hourly_demand * multiplier * weekend_mult * random.uniform(0.8, 1.2)
                        )
                        
                        if hourly_sales > 0:
                            is_peak = hour in [11, 12, 13, 17, 18, 19]
                            
                            sales_hour = SalesHourly(
                                store_id=store.id,
                                sku_id=sku.id,
                                ts_datetime=current_date.replace(hour=hour, minute=0),
                                qty_sold=hourly_sales,
                                hour_of_day=hour,
                                day_of_week=day_of_week,
                                is_peak_hour=is_peak
                            )
                            db.add(sales_hour)
        
        db.commit()
        print("✅ Hourly sales data generated")
        
        # 10. Generate IoT Telemetry Data
        print("📡 Generating IoT telemetry data...")
        
        # Sensor types with their normal ranges
        sensor_configs = {
            'cooler_temp_c': {'min': 2, 'max': 4, 'unit': 'celsius', 'variance': 0.5},
            'cooler_humidity_pct': {'min': 65, 'max': 70, 'unit': 'pct', 'variance': 2},
            'freezer_temp_c': {'min': -18, 'max': -16, 'unit': 'celsius', 'variance': 0.8},
            'ambient_temp_c': {'min': 20, 'max': 24, 'unit': 'celsius', 'variance': 1.5},
        }
        
        # Generate recent telemetry for all stores
        now = datetime.utcnow()
        
        for store in stores:
            for sensor, config in sensor_configs.items():
                # Create readings for the last hour, every 5 minutes
                for minutes_ago in range(60, 0, -5):
                    ts = now - timedelta(minutes=minutes_ago)
                    
                    # Calculate base value within normal range
                    base_value = random.uniform(config['min'], config['max'])
                    
                    # Add some variance
                    value = base_value + random.uniform(-config['variance'], config['variance'])
                    
                    # Occasionally add anomalies (5% chance)
                    if random.random() < 0.05:
                        # Temperature drift or humidity spike
                        if 'temp' in sensor:
                            value += random.choice([-3, 3])  # Temperature drift
                        else:
                            value += random.uniform(5, 10)  # Humidity spike
                    
                    telemetry = Telemetry(
                        store_id=store.id,
                        sensor=sensor,
                        value=round(value, 2),
                        unit=config['unit'],
                        ts_datetime=ts
                    )
                    db.add(telemetry)
        
        db.commit()
        print("✅ IoT telemetry data generated")
        
        # Summary
        stats = {
            "stores": len(stores),
            "skus": len(skus),
            "days_history": days_history,
            "total_snapshots": db.query(InventorySnapshot).count(),
            "total_sales": db.query(SalesDaily).count(),
            "total_sales_hourly": db.query(SalesHourly).count(),
            "total_receipts": db.query(ReceiptsDaily).count(),
            "total_telemetry": db.query(Telemetry).count(),
            "anomalies": db.query(AnomalyEvent).count(),
            "cycle_counts": db.query(CycleCount).count(),
            "transfer_recommendations": db.query(TransferRecommendation).count()
        }
        
        print("\n" + "="*50)
        print("✅ DEMO DATA GENERATION COMPLETE!")
        print("="*50)
        for key, value in stats.items():
            print(f"  {key}: {value}")
        print("="*50 + "\n")
        
        return stats
        
    except Exception as e:
        db.rollback()
        print(f"❌ Error generating demo data: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    generate_demo_data()
