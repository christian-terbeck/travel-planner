-- Price alert: a price check at or below this amount (in the option's currency) is reported.
ALTER TABLE options ADD COLUMN target_price_minor INTEGER;
