"""
Python RAG Script - Process CSV and Generate JSON Database
"""
import pandas as pd
import json

def extract_city(address):
    """Extract city from address string"""
    if pd.isna(address):
        return "Unknown"
    addr_lower = str(address).lower()
    if 'mumbai' in addr_lower or 'chembur' in addr_lower or 'mulund' in addr_lower:
        return 'Mumbai'
    elif 'pune' in addr_lower or 'wakad' in addr_lower or 'hinjewadi' in addr_lower or 'shivajinagar' in addr_lower:
        return 'Pune'
    return 'Unknown'

def process_csvs():
    """Load and merge CSV files"""
    print("Loading CSV files...")
    
    projects = pd.read_csv('../data/project.csv')
    addresses = pd.read_csv('../data/ProjectAddress.csv')
    configs = pd.read_csv('../data/ProjectConfiguration.csv')
    variants = pd.read_csv('../data/ProjectConfigurationVariant.csv')
    
    print(f"Loaded {len(projects)} projects")
    
    merged = projects.merge(configs, left_on='id', right_on='projectId', how='inner', suffixes=('_proj', '_conf'))
    merged = merged.merge(variants, left_on='id_conf', right_on='configurationId', how='inner', suffixes=('', '_var'))
    merged = merged.merge(addresses, left_on='id_proj', right_on='projectId', how='inner', suffixes=('', '_addr'))
    
    print(f"Merged: {len(merged)} property listings")
    
    properties = []
    for _, row in merged.iterrows():
        price = float(row.get('price', 0)) if pd.notna(row.get('price')) else 0
        prop = {
            'id': str(row.get('id_proj', '')),
            'projectName': str(row.get('projectName', '')),
            'slug': str(row.get('slug', '')),  # ← IMPORTANT: Include slug
            'type': str(row.get('type', '')),
            'status': str(row.get('status', '')),
            'price': price,
            'price_crores': round(price / 10000000, 2) if price else 0,
            'carpetArea': float(row.get('carpetArea', 0)) if pd.notna(row.get('carpetArea')) else 0,
            'bathrooms': int(row.get('bathrooms', 0)) if pd.notna(row.get('bathrooms')) else 0,
            'balcony': int(row.get('balcony', 0)) if pd.notna(row.get('balcony')) else 0,
            'furnishedType': str(row.get('furnishedType', 'UNFURNISHED')),
            'fullAddress': str(row.get('fullAddress', '')),
            'landmark': str(row.get('landmark', '')),
            'city': extract_city(row.get('fullAddress', '')),
            'reraId': str(row.get('reraId', ''))
        }
        properties.append(prop)
    
    return properties

def save_json(properties):
    """Save properties to JSON file"""
    output_path = '../backend/properties.json'
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(properties, f, indent=2, ensure_ascii=False)
    print(f"✓ Saved {len(properties)} properties to {output_path}")
    
    cities = {}
    types = {}
    for p in properties:
        cities[p['city']] = cities.get(p['city'], 0) + 1
        types[p['type']] = types.get(p['type'], 0) + 1
    
    print("\nDataset Statistics:")
    print(f"Total Properties: {len(properties)}")
    print(f"Cities: {cities}")
    print(f"Types: {dict(list(types.items())[:5])}")

if __name__ == "__main__":
    properties = process_csvs()
    save_json(properties)
    print("\n✓ RAG processing complete!")
