// hooks/useFilterData.js
import { useState, useEffect } from 'react';

export function useFilterData() {
  const [categories, setCategories] = useState([]);
  const [brands, setBrands] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchFilterData = async () => {
      try {
        setLoading(true);

        // Fetch categories and brands in parallel
        const [categoriesResponse, brandsResponse] = await Promise.all([
          fetch('/api/categories'),
          fetch('/api/brands')
        ]);

        if (!categoriesResponse.ok || !brandsResponse.ok) {
          throw new Error('Failed to fetch filter data');
        }

        const [categoriesData, brandsData] = await Promise.all([
          categoriesResponse.json(),
          brandsResponse.json()
        ]);



        const categoriesWithChildren = categoriesData.map((category) => ({
          ...category,
          children: categoriesData.filter((child) => child.parent === category._id),
        }));

        setCategories(categoriesWithChildren);
        setBrands(brandsData);
      } catch (err) {
        console.error('Error fetching filter data:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchFilterData();
  }, []);

  return { categories, brands, loading, error };
}
