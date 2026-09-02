-- The imported inventory snapshot retained the former site's availability
-- switches. Hoodies were all disabled even though many sizes are in stock.
update public.swag_inventory
set orderable = true,
    updated_at = timezone('utc', now())
where category = 'Hoodie'
  and orderable = false;
